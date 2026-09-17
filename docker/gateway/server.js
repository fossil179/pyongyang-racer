'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const httpProxy = require('http-proxy');

const COOKIE_NAME = '__Host-racer_queue';
const NEXT_MESSAGE = 'This game is popular! You are in the queue and are the next to play!';
const STARTING_MESSAGE = 'Your private game is starting. This usually takes under a minute.';
const SESSION_LABEL = 'racer.session';

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function immediateRuntime(defaultTarget) {
  return {
    kind: 'immediate',
    start() {
      return { target: defaultTarget };
    },
    stop() {}
  };
}

function dockerRequest(socketPath, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({
      socketPath,
      path,
      method,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = {};
        if (text) {
          try {
            json = JSON.parse(text);
          } catch {
            json = { message: text };
          }
        }
        if (res.statusCode >= 400) {
          const error = new Error(json.message || text || `Docker API ${res.statusCode}`);
          error.statusCode = res.statusCode;
          reject(error);
          return;
        }
        resolve(json);
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function waitForHttp(url, auth, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() > deadline) {
        reject(new Error(`session at ${url} did not become ready in time`));
        return;
      }
      const req = http.get(url, {
        headers: { Authorization: auth },
        timeout: 2000
      }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        setTimeout(attempt, 1000);
      });
      req.on('error', () => setTimeout(attempt, 1000));
      req.on('timeout', () => {
        req.destroy();
        setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}

class DockerRuntime {
  constructor(options = {}) {
    this.kind = 'docker';
    this.socketPath = options.socketPath || '/var/run/docker.sock';
    this.image = options.image;
    this.network = options.network;
    this.user = options.user;
    this.password = options.password;
    this.memoryMb = options.memoryMb || 768;
    this.shmSizeMb = options.shmSizeMb || 128;
    this.startTimeoutMs = options.startTimeoutMs || 120_000;
    this.auth = `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`;
  }

  request(method, path, body) {
    return dockerRequest(this.socketPath, method, path, body);
  }

  async init() {
    await this.request('GET', '/_ping');
    if (!this.network) {
      const self = await this.request('GET', `/containers/${os.hostname()}/json`);
      const networks = Object.keys(self.NetworkSettings?.Networks || {});
      this.network = networks[0];
    }
    if (!this.image || !this.network) {
      throw new Error('SESSION_IMAGE and a Docker network are required');
    }
    await this.reapOrphans();
  }

  async reapOrphans() {
    const filters = encodeURIComponent(JSON.stringify({ label: [`${SESSION_LABEL}=true`] }));
    const containers = await this.request('GET', `/containers/json?all=1&filters=${filters}`);
    await Promise.all((containers || []).map((container) => this.remove(container.Id)));
  }

  async remove(id) {
    if (!id) return;
    try {
      await this.request('DELETE', `/containers/${id}?force=true`);
    } catch (error) {
      if (error.statusCode !== 404) throw error;
    }
  }

  async start(id) {
    const name = `racer-session-${id}`;
    await this.remove(name);
    const memoryBytes = this.memoryMb * 1024 * 1024;
    const created = await this.request('POST', `/containers/create?name=${encodeURIComponent(name)}`, {
      Image: this.image,
      Env: [
        `STREAM_USER=${this.user}`,
        `STREAM_PASSWORD=${this.password}`
      ],
      Labels: {
        [SESSION_LABEL]: 'true',
        'racer.player': id
      },
      HostConfig: {
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
        ShmSize: this.shmSizeMb * 1024 * 1024,
        Memory: memoryBytes,
        MemorySwap: memoryBytes,
        NetworkMode: this.network,
        RestartPolicy: { Name: 'no' },
        Tmpfs: { '/tmp': 'size=128M,mode=1777' },
        PidsLimit: 256
      }
    });
    const containerId = created.Id;
    try {
      await this.request('POST', `/containers/${containerId}/start`);
      const inspect = await this.request('GET', `/containers/${containerId}/json`);
      const endpoint = inspect.NetworkSettings?.Networks?.[this.network];
      const ip = endpoint?.IPAddress;
      if (!ip) throw new Error('session container has no IP address');
      const target = `http://${ip}:6080`;
      await waitForHttp(target, this.auth, this.startTimeoutMs);
      return { target, containerId, name };
    } catch (error) {
      await this.remove(containerId);
      throw error;
    }
  }

  async stop(session) {
    await this.remove(session?.handle?.containerId || session?.handle?.name);
  }
}

class QueueManager {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.maxActiveMs = options.maxActiveMs || 15 * 60_000;
    this.heartbeatMs = options.heartbeatMs || 60_000;
    this.waitingExpiryMs = options.waitingExpiryMs || 5 * 60_000;
    this.startTimeoutMs = options.startTimeoutMs || 120_000;
    this.capacity = options.capacity || 50;
    this.slots = options.slots || 1;
    this.maxPerIp = options.maxPerIp || 4;
    this.runtime = options.runtime || immediateRuntime(options.defaultTarget || 'http://127.0.0.1:9');
    this.entries = new Map();
    this.queue = [];
    this.sessions = new Map();
  }

  activeCount() {
    return [...this.sessions.values()].filter((session) => session.state === 'active').length;
  }

  usedSlots() {
    return this.sessions.size;
  }

  maintain() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      const waitingTooLongToStart = session.state === 'starting' &&
        now - session.startedAt >= this.startTimeoutMs;
      const turnExpired = session.state === 'active' &&
        now - session.startedAt >= this.maxActiveMs;
      const heartbeatExpired = session.state === 'active' &&
        now - session.lastHeartbeat >= this.heartbeatMs;
      if (waitingTooLongToStart || turnExpired || heartbeatExpired) {
        this.reap(id);
      }
    }

    this.queue = this.queue.filter((id) => {
      const entry = this.entries.get(id);
      if (!entry || now - entry.lastSeen >= this.waitingExpiryMs) {
        this.entries.delete(id);
        return false;
      }
      return true;
    });
    this.promote();
  }

  reap(id) {
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    this.entries.delete(id);
    if (session) {
      Promise.resolve(this.runtime.stop(session)).catch((error) => {
        console.error('failed to stop session', id, error);
      });
    }
  }

  begin(id, ip) {
    const now = this.now();
    const previous = this.entries.get(id);
    const session = {
      id,
      ip,
      state: 'starting',
      startedAt: now,
      lastHeartbeat: now,
      attempts: previous?.attempts || 0,
      target: null,
      handle: null
    };
    this.entries.set(id, { id, ip, joinedAt: now, lastSeen: now, attempts: session.attempts });
    this.sessions.set(id, session);
    this.launch(session);
  }

  launch(session) {
    session.attempts += 1;
    const entry = this.entries.get(session.id);
    if (entry) entry.attempts = session.attempts;
    session.state = 'starting';
    session.startedAt = this.now();
    let started;
    try {
      started = this.runtime.start(session.id);
    } catch (error) {
      this.failStart(session, error);
      return;
    }
    if (started && typeof started.then === 'function') {
      started.then((handle) => this.activate(session, handle), (error) => this.failStart(session, error));
      return;
    }
    this.activate(session, started);
  }

  activate(session, handle) {
    if (this.sessions.get(session.id) !== session) {
      Promise.resolve(this.runtime.stop({ handle })).catch(() => {});
      return;
    }
    session.handle = handle;
    session.target = handle.target;
    session.state = 'active';
    session.lastHeartbeat = this.now();
    console.log(`session ready id=${session.id.slice(0, 8)} target=${session.target}`);
  }

  failStart(session, error) {
    console.error('session start failed', session.id, error);
    if (this.sessions.get(session.id) !== session) return;
    this.sessions.delete(session.id);
    if (session.attempts < 2 && this.entries.has(session.id)) {
      this.queue.unshift(session.id);
    } else {
      this.entries.delete(session.id);
    }
    this.promote();
  }

  promote() {
    while (this.usedSlots() < this.slots && this.queue.length) {
      const id = this.queue.shift();
      const entry = this.entries.get(id);
      if (!entry) continue;
      this.begin(id, entry.ip);
    }
  }

  ipCount(ip, exceptId) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.id !== exceptId && session.ip === ip) count += 1;
    }
    for (const queuedId of this.queue) {
      if (queuedId === exceptId) continue;
      if (this.entries.get(queuedId)?.ip === ip) count += 1;
    }
    return count;
  }

  sessionsForIp(ip) {
    return [...this.sessions.values()].filter((session) => session.ip === ip);
  }

  rebind(session, newId) {
    const oldId = session.id;
    if (oldId === newId) return session;
    this.sessions.delete(oldId);
    this.entries.delete(oldId);
    this.queue = this.queue.filter((id) => id !== oldId);
    session.id = newId;
    const now = this.now();
    session.lastHeartbeat = now;
    this.sessions.set(newId, session);
    this.entries.set(newId, {
      id: newId,
      ip: session.ip,
      joinedAt: session.startedAt,
      lastSeen: now,
      attempts: session.attempts
    });
    return session;
  }

  recoverIdentity(id, ip, options = {}) {
    const existing = this.sessionsForIp(ip);
    const starting = existing.find((session) => session.state === 'starting');
    if (starting) return this.rebind(starting, id);
    if (options.fromHeartbeat && existing.length === 1) {
      return this.rebind(existing[0], id);
    }
    return null;
  }

  admit(id, ip) {
    this.maintain();
    const now = this.now();
    if (this.sessions.has(id)) {
      const session = this.sessions.get(id);
      session.lastHeartbeat = now;
      const entry = this.entries.get(id);
      if (entry) entry.lastSeen = now;
      return this.status(id);
    }

    const existing = this.entries.get(id);
    if (existing && this.queue.includes(id)) {
      if (existing.ip !== ip) return { state: 'denied', reason: 'identity_mismatch' };
      existing.lastSeen = now;
      return this.status(id);
    }

    const recovered = this.recoverIdentity(id, ip);
    if (recovered) return this.status(id);

    if (this.ipCount(ip, id) >= this.maxPerIp) {
      return { state: 'denied', reason: 'ip_limit' };
    }

    if (this.usedSlots() < this.slots) {
      this.begin(id, ip);
      return this.status(id);
    }
    if (this.queue.length >= this.capacity) {
      return { state: 'denied', reason: 'capacity' };
    }

    this.entries.set(id, { id, ip, joinedAt: now, lastSeen: now });
    this.queue.push(id);
    return this.status(id);
  }

  heartbeat(id, ip) {
    this.maintain();
    if (!this.sessions.has(id) && ip) this.recoverIdentity(id, ip, { fromHeartbeat: true });
    const session = this.sessions.get(id);
    if (!session) return this.status(id);
    session.lastHeartbeat = this.now();
    const entry = this.entries.get(id);
    if (entry) entry.lastSeen = session.lastHeartbeat;
    return this.status(id);
  }

  isActive(id) {
    this.maintain();
    const session = this.sessions.get(id);
    return session?.state === 'active' && Boolean(session.target);
  }

  getTarget(id) {
    const session = this.sessions.get(id);
    return session?.state === 'active' ? session.target : null;
  }

  snapshot() {
    this.maintain();
    return {
      slots: this.slots,
      active: this.activeCount(),
      starting: [...this.sessions.values()].filter((session) => session.state === 'starting').length,
      waiting: this.queue.length
    };
  }

  async stopAll() {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map(async (id) => {
      const session = this.sessions.get(id);
      this.sessions.delete(id);
      this.entries.delete(id);
      try {
        await this.runtime.stop(session);
      } catch (error) {
        console.error('failed to stop session', id, error);
      }
    }));
  }

  status(id) {
    const session = this.sessions.get(id);
    if (session?.state === 'active') {
      return {
        state: 'active',
        remainingSeconds: Math.max(
          0,
          Math.ceil((this.maxActiveMs - (this.now() - session.startedAt)) / 1000)
        )
      };
    }
    if (session?.state === 'starting') {
      return { state: 'starting', message: STARTING_MESSAGE };
    }
    const index = this.queue.indexOf(id);
    if (index >= 0) {
      const position = index + 1;
      return {
        state: 'waiting',
        position,
        message: position === 1
          ? NEXT_MESSAGE
          : `This game is popular! You are number ${position} in the queue.`
      };
    }
    return { state: 'absent' };
  }
}

class RateLimiter {
  constructor(limit, windowMs, now = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.clients = new Map();
  }

  allow(key) {
    const now = this.now();
    let record = this.clients.get(key);
    if (!record || now - record.startedAt >= this.windowMs) {
      record = { startedAt: now, count: 0 };
      this.clients.set(key, record);
    }
    record.count += 1;
    return record.count <= this.limit;
  }

  sweep() {
    const now = this.now();
    for (const [key, record] of this.clients) {
      if (now - record.startedAt >= this.windowMs * 2) this.clients.delete(key);
    }
  }
}

function parseCookies(header = '') {
  const cookies = {};
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    cookies[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
  }
  return cookies;
}

function validIdentity(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function requestIdentity(req) {
  const candidate = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (validIdentity(candidate)) return { id: candidate, isNew: false };
  return { id: crypto.randomBytes(32).toString('base64url'), isNew: true };
}

function clientIp(req, trustProxy) {
  let value = req.socket.remoteAddress || 'unknown';
  if (trustProxy && typeof req.headers['x-forwarded-for'] === 'string') {
    value = req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  if (value.startsWith('::ffff:')) value = value.slice(7);
  return net.isIP(value) ? value : 'unknown';
}

function cookieHeader(id) {
  return `${COOKIE_NAME}=${id}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=86400`;
}

function allowedEmbedOrigins(value) {
  const origins = [];
  for (const candidate of String(value || '').split(/\s+/).filter(Boolean)) {
    try {
      const parsed = new URL(candidate);
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        parsed.origin === candidate
      ) {
        origins.push(candidate);
      }
    } catch {
      // Ignore invalid configured origins rather than placing them in CSP.
    }
  }
  return origins;
}

function securityHeaders(nonce, embedOrigins) {
  const frameAncestors = [`'self'`, ...embedOrigins];
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; font-src 'self'; worker-src 'self' blob:; frame-ancestors ${frameAncestors.join(' ')}; base-uri 'none'; form-action 'none'`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  };
}

function sendJson(res, statusCode, body, identity) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  if (identity?.isNew) headers['Set-Cookie'] = cookieHeader(identity.id);
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(body));
}

function statusCodeFor(status) {
  if (status.state !== 'denied') return 200;
  return status.reason === 'capacity' ? 503 : 429;
}

function shellHtml(status, nonce) {
  const active = status.state === 'active';
  const message = active
    ? 'Your game is ready. This session lasts up to 15 minutes.'
    : status.message || (
      status.reason === 'capacity'
        ? 'The queue is full. Please try again later.'
        : status.reason === 'ip_limit'
          ? 'This connection already has a game. Wait a few seconds and reload, or open the game in a new window.'
          : 'Please wait while your queue place is prepared.'
    );
  const initialStatus = JSON.stringify(status).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Pyongyang Racer</title>
  <style>
    :root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101318;color:#f4f5f7}
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:#101318;color:#f4f5f7}
    body{min-height:100dvh;display:grid;place-items:center;padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom))}
    main{width:min(920px,100%);text-align:center}
    #status{padding:.75rem .5rem;font-size:1.05rem}
    #playfield{position:relative;display:${active ? 'block' : 'none'};width:min(100%,760px);margin:0 auto;background:#000}
    #game{display:block;width:100%;height:auto;aspect-ratio:760/500;border:0;background:#000}
    #fullscreen{display:none;position:absolute;top:8px;right:8px;z-index:4;padding:.45rem .8rem;border:0;border-radius:8px;background:rgba(230,99,0,.92);color:#fff;font:inherit;font-weight:700;cursor:pointer;pointer-events:auto}
    #playfield:fullscreen,#playfield:-webkit-full-screen{width:100%;height:100%;max-width:none;display:flex;align-items:center;justify-content:center;background:#000}
    #playfield:fullscreen #game,#playfield:-webkit-full-screen #game{width:min(100vw,calc(100vh * 760 / 500));height:min(100vh,calc(100vw * 500 / 760));aspect-ratio:760/500}
    #playfield:fullscreen #fullscreen,#playfield:-webkit-full-screen #fullscreen{display:inline-block}
    .note{color:#aeb7c4;font-size:.9rem;margin:.75rem .5rem}
    #touch-controls{display:none;position:absolute;inset:0;pointer-events:none;z-index:3}
    #touch-controls .pad{position:absolute;bottom:max(8px,env(safe-area-inset-bottom));display:flex;gap:8px;pointer-events:auto}
    #touch-controls .pad-left{left:max(8px,env(safe-area-inset-left))}
    #touch-controls .pad-right{right:max(8px,env(safe-area-inset-right));flex-direction:column}
    .ctl{width:56px;height:56px;border:2px solid rgba(255,255,255,.35);border-radius:12px;background:rgba(16,19,24,.72);color:#fff;font-size:20px;font-weight:700;touch-action:manipulation;-webkit-user-select:none;user-select:none}
    .ctl:active{background:rgba(230,99,0,.55);border-color:#e66300}
    @media (pointer:coarse),(max-width:800px){
      body{place-items:start center}
      #touch-controls{display:block}
      .ctl{width:64px;height:64px}
    }
  </style>
</head>
<body>
  <main>
    <div id="status" role="status" aria-live="polite">${message}</div>
    <div id="playfield">
      <iframe id="game" title="Pyongyang Racer" ${active ? 'src="/stream/"' : ''}
        allow="autoplay; fullscreen; gamepad; screen-wake-lock; clipboard-read; clipboard-write"></iframe>
      <button type="button" id="fullscreen">Full screen</button>
      <div id="touch-controls">
        <div class="pad pad-left">
          <button type="button" class="ctl" data-key="ArrowLeft" aria-label="Steer left">◀</button>
          <button type="button" class="ctl" data-key="ArrowRight" aria-label="Steer right">▶</button>
        </div>
        <div class="pad pad-right">
          <button type="button" class="ctl" data-key="ArrowUp" aria-label="Accelerate">▲</button>
          <button type="button" class="ctl" data-key="ArrowDown" aria-label="Brake">▼</button>
          <button type="button" class="ctl" data-key=" " aria-label="Honk">H</button>
        </div>
      </div>
    </div>
    <p class="note">Keep this page open to retain your place. On a phone, use the on-screen buttons. Tap the game once for engine and horn sounds.</p>
  </main>
  <script nonce="${nonce}">
    const initial = ${initialStatus};
    const statusNode = document.getElementById('status');
    const playfield = document.getElementById('playfield');
    const game = document.getElementById('game');
    const fullscreenBtn = document.getElementById('fullscreen');
    const held = Object.create(null);
    const keyCodeFor = {ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,' ':32};
    let mode = initial.state;
    function sendKey(key, type) {
      const win = game.contentWindow;
      if (!win) return;
      const event = new KeyboardEvent(type, {
        key: key,
        code: key === ' ' ? 'Space' : key,
        keyCode: keyCodeFor[key] || 0,
        which: keyCodeFor[key] || 0,
        bubbles: true,
        cancelable: true
      });
      win.dispatchEvent(event);
      try { win.document.dispatchEvent(event); } catch (_) {}
    }
    function releaseAll() {
      Object.keys(held).forEach((key) => {
        if (!held[key]) return;
        held[key] = false;
        sendKey(key, 'keyup');
      });
    }
    document.querySelectorAll('.ctl').forEach((btn) => {
      const key = btn.getAttribute('data-key');
      const down = (event) => {
        event.preventDefault();
        if (held[key]) return;
        held[key] = true;
        sendKey(key, 'keydown');
      };
      const up = (event) => {
        event.preventDefault();
        if (!held[key]) return;
        held[key] = false;
        sendKey(key, 'keyup');
      };
      btn.addEventListener('touchstart', down, {passive:false});
      btn.addEventListener('touchend', up, {passive:false});
      btn.addEventListener('touchcancel', up, {passive:false});
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
    });
    window.addEventListener('blur', releaseAll);
    function isFullscreen() {
      return document.fullscreenElement === playfield || document.webkitFullscreenElement === playfield;
    }
    function syncFullscreenLabel() {
      fullscreenBtn.textContent = isFullscreen() ? 'Exit full screen' : 'Full screen';
    }
    function exitFullscreen() {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit && isFullscreen()) exit.call(document);
    }
    fullscreenBtn.addEventListener('click', () => {
      if (isFullscreen()) {
        exitFullscreen();
        return;
      }
      const request = playfield.requestFullscreen || playfield.webkitRequestFullscreen;
      if (request) request.call(playfield);
    });
    document.addEventListener('fullscreenchange', syncFullscreenLabel);
    document.addEventListener('webkitfullscreenchange', syncFullscreenLabel);
    function render(data) {
      mode = data.state;
      if (data.state === 'active') {
        statusNode.textContent = 'Your game is ready. Time remaining: ' +
          Math.max(0, data.remainingSeconds) + ' seconds.';
        if (!game.getAttribute('src')) game.src = '/stream/';
        playfield.style.display = 'block';
        fullscreenBtn.style.display = 'inline-block';
      } else {
        statusNode.textContent = data.message ||
          (data.reason === 'capacity' ? 'The queue is full. Please try again later.' :
          data.reason === 'ip_limit' ? 'This connection already has a game. Wait a few seconds and reload, or open the game in a new window.' :
          data.state === 'starting' ? ${JSON.stringify(STARTING_MESSAGE)} :
          'Waiting for a queue place...');
        game.removeAttribute('src');
        playfield.style.display = 'none';
        fullscreenBtn.style.display = 'none';
        exitFullscreen();
        releaseAll();
      }
    }
    async function update() {
      try {
        const endpoint = (mode === 'active' || mode === 'starting') ? '/api/heartbeat' : '/api/status';
        const response = await fetch(endpoint, {
          method: (mode === 'active' || mode === 'starting') ? 'POST' : 'GET',
          cache: 'no-store',
          credentials: 'same-origin'
        });
        render(await response.json());
      } catch (_) {
        statusNode.textContent = 'Connection interrupted. Retrying...';
      }
    }
    setInterval(update, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
    if (initial.state === 'starting') {
      const startPoll = setInterval(async () => {
        await update();
        if (mode !== 'starting') clearInterval(startPoll);
      }, 2000);
    }
  </script>
</body>
</html>`;
}

function createSessionRuntime(env, options, upstream) {
  if (options.runtime) return options.runtime;
  const image = options.sessionImage ?? env.SESSION_IMAGE;
  const socketPath = options.dockerSocket ?? env.DOCKER_SOCKET ?? '/var/run/docker.sock';
  if (image) {
    if (!fs.existsSync(socketPath)) {
      throw new Error(`SESSION_IMAGE is set but Docker socket ${socketPath} is missing`);
    }
    return new DockerRuntime({
      socketPath,
      image,
      network: options.sessionNetwork ?? env.SESSION_NETWORK,
      user: options.upstreamUser ?? env.STREAM_USER,
      password: options.upstreamPassword ?? env.STREAM_PASSWORD,
      memoryMb: positiveInt(env.SESSION_MEMORY_MB, 768),
      shmSizeMb: positiveInt(env.SESSION_SHM_SIZE_MB, 128),
      startTimeoutMs: positiveInt(env.SESSION_START_TIMEOUT_SECONDS, 120) * 1000
    });
  }
  return immediateRuntime(upstream);
}

function createGateway(options = {}) {
  const env = options.env || process.env;
  const upstream = options.upstream || env.UPSTREAM_URL || 'http://pyongyang-racer:6080';
  const upstreamUser = options.upstreamUser ?? env.STREAM_USER;
  const upstreamPassword = options.upstreamPassword ?? env.STREAM_PASSWORD;
  if (!upstreamUser || !upstreamPassword) {
    throw new Error('STREAM_USER and STREAM_PASSWORD are required');
  }
  const runtime = createSessionRuntime(env, options, upstream);
  const queue = options.queue || new QueueManager({
    maxActiveMs: positiveInt(env.MAX_ACTIVE_SECONDS, 900) * 1000,
    heartbeatMs: positiveInt(env.HEARTBEAT_TIMEOUT_SECONDS, 60) * 1000,
    waitingExpiryMs: positiveInt(env.WAITING_EXPIRY_SECONDS, 300) * 1000,
    startTimeoutMs: positiveInt(env.SESSION_START_TIMEOUT_SECONDS, 120) * 1000,
    capacity: positiveInt(env.QUEUE_CAPACITY, 50),
    slots: options.slots || positiveInt(env.SESSION_SLOTS, 8),
    maxPerIp: options.maxPerIp || positiveInt(env.SESSION_PER_IP, 4),
    runtime,
    defaultTarget: upstream
  });
  const trustProxy = options.trustProxy ?? env.TRUST_PROXY === 'true';
  const embedOrigins = allowedEmbedOrigins(
    options.embedOrigins ?? env.EMBED_ORIGINS ??
      'https://pyongyangracer.com http://pyongyangracer.com'
  );
  const auth = `Basic ${Buffer.from(`${upstreamUser}:${upstreamPassword}`).toString('base64')}`;
  const limiter = options.limiter || new RateLimiter(
    positiveInt(env.RATE_LIMIT_REQUESTS, 120),
    positiveInt(env.RATE_LIMIT_WINDOW_SECONDS, 60) * 1000
  );
  const proxy = httpProxy.createProxyServer({
    target: upstream,
    ws: true,
    changeOrigin: false,
    xfwd: false
  });

  proxy.on('proxyReq', (proxyReq, req) => {
    proxyReq.setHeader('Authorization', auth);
    proxyReq.removeHeader('Cookie');
    proxyReq.removeHeader('X-Forwarded-For');
    proxyReq.path = req.url.slice('/stream'.length) || '/';
  });
  proxy.on('proxyReqWs', (proxyReq, req) => {
    proxyReq.setHeader('Authorization', auth);
    proxyReq.removeHeader('Cookie');
    proxyReq.removeHeader('X-Forwarded-For');
    proxyReq.path = req.url.slice('/stream'.length) || '/';
  });
  proxy.on('proxyRes', (proxyRes) => {
    delete proxyRes.headers['set-cookie'];
    delete proxyRes.headers['www-authenticate'];
    delete proxyRes.headers['x-frame-options'];
    const location = proxyRes.headers.location;
    if (typeof location === 'string' && location.startsWith('/')) {
      proxyRes.headers.location = `/stream${location}`;
    }
  });
  proxy.on('error', (error, req, res) => {
    if (res && !res.headersSent && typeof res.writeHead === 'function') {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Game stream is temporarily unavailable.');
    } else if (res?.destroy) {
      res.destroy(error);
    }
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://gateway.invalid');
    if (url.pathname === '/healthz') {
      sendJson(res, 200, { status: 'ok', allocator: runtime.kind, ...queue.snapshot() });
      return;
    }

    const identity = requestIdentity(req);
    const ip = clientIp(req, trustProxy);

    if (url.pathname.startsWith('/stream/')) {
      if (!queue.isActive(identity.id)) {
        sendJson(res, 403, { error: 'active_session_required' }, identity);
        return;
      }
      req.headers.authorization = auth;
      proxy.web(req, res, { target: queue.getTarget(identity.id) });
      return;
    }

    if (!limiter.allow(ip)) {
      sendJson(res, 429, { state: 'denied', reason: 'rate_limit' }, identity);
      return;
    }

    if (url.pathname === '/api/status' && req.method === 'GET') {
      const status = queue.admit(identity.id, ip);
      sendJson(res, statusCodeFor(status), status, identity);
      return;
    }
    if (url.pathname === '/api/heartbeat' && req.method === 'POST') {
      req.resume();
      const status = queue.heartbeat(identity.id, ip);
      sendJson(res, status.state === 'absent' ? 409 : 200, status, identity);
      return;
    }
    if (url.pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
      const status = queue.admit(identity.id, ip);
      const nonce = crypto.randomBytes(18).toString('base64');
      const body = req.method === 'HEAD' ? '' : shellHtml(status, nonce);
      const headers = {
        ...securityHeaders(nonce, embedOrigins),
        'Content-Type': 'text/html; charset=utf-8'
      };
      if (identity.isNew) headers['Set-Cookie'] = cookieHeader(identity.id);
      res.writeHead(statusCodeFor(status), headers);
      res.end(body);
      return;
    }

    sendJson(res, 404, { error: 'not_found' }, identity);
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://gateway.invalid');
    const identity = requestIdentity(req);
    if (!url.pathname.startsWith('/stream/') || !queue.isActive(identity.id)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    req.headers.authorization = auth;
    proxy.ws(req, socket, head, { target: queue.getTarget(identity.id) });
  });

  const cleanup = setInterval(() => {
    queue.maintain();
    limiter.sweep();
  }, 10_000);
  cleanup.unref();
  server.on('close', () => {
    clearInterval(cleanup);
    proxy.close();
    queue.stopAll().catch((error) => {
      console.error('failed to stop sessions on shutdown', error);
    });
  });
  return { server, queue, limiter, runtime };
}

async function startGateway() {
  const port = positiveInt(process.env.PORT, 8080);
  const { server, runtime, queue } = createGateway();
  if (typeof runtime.init === 'function') {
    await runtime.init();
  }
  await new Promise((resolve) => {
    server.listen(port, '0.0.0.0', resolve);
  });
  console.log(`Session allocator listening on port ${port} slots=${queue.slots} runtime=${runtime.kind}`);
  const shutdown = () => {
    server.close(() => {
      queue.stopAll().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  startGateway().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  COOKIE_NAME,
  NEXT_MESSAGE,
  STARTING_MESSAGE,
  QueueManager,
  RateLimiter,
  DockerRuntime,
  createGateway
};
