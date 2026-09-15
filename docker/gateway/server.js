'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const httpProxy = require('http-proxy');

const COOKIE_NAME = '__Host-racer_queue';
const NEXT_MESSAGE = 'This game is popular! You are in the queue and are the next to play!';

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class QueueManager {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.maxActiveMs = options.maxActiveMs || 15 * 60_000;
    this.heartbeatMs = options.heartbeatMs || 60_000;
    this.waitingExpiryMs = options.waitingExpiryMs || 5 * 60_000;
    this.capacity = options.capacity || 50;
    this.entries = new Map();
    this.queue = [];
    this.active = null;
  }

  maintain() {
    const now = this.now();
    if (this.active && (
      now - this.active.startedAt >= this.maxActiveMs ||
      now - this.active.lastHeartbeat >= this.heartbeatMs
    )) {
      this.entries.delete(this.active.id);
      this.active = null;
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

  promote() {
    if (this.active) return;
    while (this.queue.length) {
      const id = this.queue.shift();
      const entry = this.entries.get(id);
      if (!entry) continue;
      const now = this.now();
      this.active = {
        id,
        ip: entry.ip,
        startedAt: now,
        lastHeartbeat: now
      };
      return;
    }
  }

  admit(id, ip) {
    this.maintain();
    const now = this.now();
    if (this.active?.id === id) return this.status(id);

    const existing = this.entries.get(id);
    if (existing && this.queue.includes(id)) {
      if (existing.ip !== ip) return { state: 'denied', reason: 'identity_mismatch' };
      existing.lastSeen = now;
      return this.status(id);
    }

    const ipInUse = this.active?.ip === ip || this.queue.some((queuedId) => {
      const queued = this.entries.get(queuedId);
      return queued?.ip === ip;
    });
    if (ipInUse) return { state: 'denied', reason: 'ip_limit' };

    if (!this.active) {
      this.entries.set(id, { id, ip, joinedAt: now, lastSeen: now });
      this.active = { id, ip, startedAt: now, lastHeartbeat: now };
      return this.status(id);
    }
    if (this.queue.length >= this.capacity) {
      return { state: 'denied', reason: 'capacity' };
    }

    this.entries.set(id, { id, ip, joinedAt: now, lastSeen: now });
    this.queue.push(id);
    return this.status(id);
  }

  heartbeat(id) {
    this.maintain();
    if (this.active?.id !== id) return this.status(id);
    this.active.lastHeartbeat = this.now();
    return this.status(id);
  }

  isActive(id) {
    this.maintain();
    return this.active?.id === id;
  }

  status(id) {
    if (this.active?.id === id) {
      return {
        state: 'active',
        remainingSeconds: Math.max(
          0,
          Math.ceil((this.maxActiveMs - (this.now() - this.active.startedAt)) / 1000)
        )
      };
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
  return `${COOKIE_NAME}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
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
    ? 'Your turn is ready. The game session lasts up to 15 minutes.'
    : status.message || (
      status.reason === 'capacity'
        ? 'The queue is full. Please try again later.'
        : status.reason === 'ip_limit'
          ? 'This network address already has an active or waiting player.'
          : 'Please wait while your queue place is prepared.'
    );
  const initialStatus = JSON.stringify(status).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pyongyang Racer queue</title>
  <style>
    :root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101318;color:#f4f5f7}
    body{margin:0;min-height:100vh;display:grid;place-items:center}
    main{width:min(920px,100%);text-align:center}
    #status{padding:1rem;font-size:1.05rem}
    #game{display:${active ? 'block' : 'none'};width:min(100%,760px);height:auto;aspect-ratio:760/500;margin:auto;border:0;background:#000}
    .note{color:#aeb7c4;font-size:.9rem}
  </style>
</head>
<body>
  <main>
    <div id="status" role="status" aria-live="polite">${message}</div>
    <iframe id="game" title="Pyongyang Racer" ${active ? 'src="/stream/"' : ''}
      allow="autoplay; fullscreen; gamepad; screen-wake-lock; clipboard-read; clipboard-write"></iframe>
    <p class="note">Keep this page open to retain your place or active turn.</p>
  </main>
  <script nonce="${nonce}">
    const initial = ${initialStatus};
    const statusNode = document.getElementById('status');
    const game = document.getElementById('game');
    let wasActive = initial.state === 'active';
    function render(data) {
      if (data.state === 'active') {
        statusNode.textContent = 'Your turn is ready. Time remaining: ' +
          Math.max(0, data.remainingSeconds) + ' seconds.';
        if (!game.src) game.src = '/stream/';
        game.style.display = 'block';
        wasActive = true;
      } else {
        statusNode.textContent = data.message ||
          (data.reason === 'capacity' ? 'The queue is full. Please try again later.' :
          data.reason === 'ip_limit' ? 'This network address already has an active or waiting player.' :
          'Waiting for a queue place...');
        if (wasActive) {
          game.removeAttribute('src');
          game.style.display = 'none';
          wasActive = false;
        }
      }
    }
    async function update() {
      try {
        const endpoint = wasActive ? '/api/heartbeat' : '/api/status';
        const response = await fetch(endpoint, {
          method: wasActive ? 'POST' : 'GET',
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
  </script>
</body>
</html>`;
}

function createGateway(options = {}) {
  const env = options.env || process.env;
  const queue = options.queue || new QueueManager({
    maxActiveMs: positiveInt(env.MAX_ACTIVE_SECONDS, 900) * 1000,
    heartbeatMs: positiveInt(env.HEARTBEAT_TIMEOUT_SECONDS, 60) * 1000,
    waitingExpiryMs: positiveInt(env.WAITING_EXPIRY_SECONDS, 300) * 1000,
    capacity: positiveInt(env.QUEUE_CAPACITY, 50)
  });
  const trustProxy = options.trustProxy ?? env.TRUST_PROXY === 'true';
  const embedOrigins = allowedEmbedOrigins(
    options.embedOrigins ?? env.EMBED_ORIGINS ??
      'https://pyongyangracer.com http://pyongyangracer.com'
  );
  const upstream = options.upstream || env.UPSTREAM_URL || 'http://pyongyang-racer:6080';
  const upstreamUser = options.upstreamUser ?? env.STREAM_USER;
  const upstreamPassword = options.upstreamPassword ?? env.STREAM_PASSWORD;
  if (!upstreamUser || !upstreamPassword) {
    throw new Error('STREAM_USER and STREAM_PASSWORD are required');
  }
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
      sendJson(res, 200, { status: 'ok' });
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
      proxy.web(req, res);
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
      const status = queue.heartbeat(identity.id);
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
    proxy.ws(req, socket, head);
  });

  const cleanup = setInterval(() => {
    queue.maintain();
    limiter.sweep();
  }, 10_000);
  cleanup.unref();
  server.on('close', () => {
    clearInterval(cleanup);
    proxy.close();
  });
  return { server, queue, limiter };
}

if (require.main === module) {
  const port = positiveInt(process.env.PORT, 8080);
  const { server } = createGateway();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Queue gateway listening on port ${port}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = {
  COOKIE_NAME,
  NEXT_MESSAGE,
  QueueManager,
  RateLimiter,
  createGateway
};
