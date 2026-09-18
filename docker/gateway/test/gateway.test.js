'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');

const {
  COOKIE_NAME,
  NEXT_MESSAGE,
  QueueManager,
  RateLimiter,
  Leaderboard,
  createGateway
} = require('../server');
const { validateRacerName } = require('../name-filter');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body;
    const headers = { ...options.headers };
    if (body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString()
      }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function cookieFrom(response) {
  return response.headers['set-cookie'][0].split(';', 1)[0];
}

const testEnv = {
  STREAM_USER: 'private-user',
  STREAM_PASSWORD: 'private-password'
};

test('serves anonymous shell and queues visitors in order', async (t) => {
  const upstream = http.createServer((_req, res) => res.end('upstream'));
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({
    env: testEnv,
    slots: 1,
    maxPerIp: 1,
    upstream: `http://127.0.0.1:${upstreamPort}`,
    upstreamUser: 'private-user',
    upstreamPassword: 'private-password',
    trustProxy: true
  });
  const port = await listen(server);
  t.after(() => Promise.all([close(server), close(upstream)]));

  const active = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.1' } });
  assert.equal(active.status, 200);
  assert.match(active.body, /src="\/stream\/"/);
  assert.doesNotMatch(active.body, /Full screen/);
  assert.match(active.body, /Top 10 name/);
  assert.match(active.body, /hover:none\) and \(pointer:coarse\)/);
  assert.doesNotMatch(active.body, /pointer:coarse\),\(max-width/);
  assert.equal(active.headers['www-authenticate'], undefined);
  assert.match(active.headers['set-cookie'][0], new RegExp(`^${COOKIE_NAME}=`));
  assert.match(active.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=None; Partitioned/);
  assert.match(
    active.headers['content-security-policy'],
    /frame-ancestors 'self' https:\/\/pyongyangracer\.com/
  );
  assert.equal(active.headers['x-frame-options'], undefined);

  const next = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.2' } });
  assert.equal(next.status, 200);
  assert.ok(next.body.includes(NEXT_MESSAGE));
  assert.match(next.body, /Estimated wait:/);

  const later = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.3' } });
  assert.match(later.body, /number 2 in the queue/);
  assert.match(later.body, /Estimated wait:/);

  const duplicateIp = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.2' } });
  assert.equal(duplicateIp.status, 429);
  assert.match(duplicateIp.body, /already has a game/);
});

test('expires silent and overlong sessions and promotes first waiter', () => {
  let now = 1_000;
  const queue = new QueueManager({
    now: () => now,
    heartbeatMs: 60_000,
    maxActiveMs: 900_000,
    waitingExpiryMs: 2_000_000,
    capacity: 5
  });

  assert.equal(queue.admit('a', '192.0.2.1').state, 'active');
  assert.equal(queue.admit('b', '192.0.2.2').position, 1);
  now += 60_000;
  queue.maintain();
  assert.equal(queue.status('b').state, 'active');

  now += 10_000;
  queue.heartbeat('b');
  queue.admit('c', '192.0.2.3');
  now += 900_000;
  queue.maintain();
  assert.equal(queue.status('c').state, 'active');
});

test('estimates queue wait from remaining session time', () => {
  let now = 0;
  const queue = new QueueManager({
    now: () => now,
    slots: 2,
    maxActiveMs: 900_000,
    heartbeatMs: 2_000_000,
    waitingExpiryMs: 2_000_000,
    capacity: 10
  });

  assert.equal(queue.admit('a', '192.0.2.1').state, 'active');
  now = 300_000;
  queue.heartbeat('a');
  assert.equal(queue.admit('b', '192.0.2.2').state, 'active');
  const first = queue.admit('c', '192.0.2.3');
  assert.equal(first.state, 'waiting');
  assert.equal(first.position, 1);
  assert.equal(first.waitSeconds, 600);
  assert.match(first.message, /next to play/);
  assert.match(first.message, /about 10 minutes/);

  const second = queue.admit('d', '192.0.2.4');
  assert.equal(second.position, 2);
  assert.equal(second.waitSeconds, 900);
  assert.match(second.message, /number 2 in the queue/);
  assert.match(second.message, /about 15 minutes/);

  const third = queue.admit('e', '192.0.2.5');
  assert.equal(third.position, 3);
  assert.equal(third.waitSeconds, 1500);
  assert.match(third.message, /about 25 minutes/);
});

test('expires abandoned waiters and enforces capacity', () => {
  let now = 0;
  const queue = new QueueManager({
    now: () => now,
    heartbeatMs: 60_000,
    maxActiveMs: 900_000,
    waitingExpiryMs: 5_000,
    capacity: 1
  });
  queue.admit('a', '192.0.2.1');
  assert.equal(queue.admit('b', '192.0.2.2').state, 'waiting');
  assert.deepEqual(queue.admit('c', '192.0.2.3'), { state: 'denied', reason: 'capacity' });
  now = 5_000;
  queue.maintain();
  assert.equal(queue.status('b').state, 'absent');
  assert.equal(queue.admit('c', '192.0.2.3').state, 'waiting');
});

test('rate limiter resets after its fixed window', () => {
  let now = 0;
  const limiter = new RateLimiter(2, 1_000, () => now);
  assert.equal(limiter.allow('ip'), true);
  assert.equal(limiter.allow('ip'), true);
  assert.equal(limiter.allow('ip'), false);
  now = 1_000;
  assert.equal(limiter.allow('ip'), true);
});

test('proxies only the active identity and injects upstream auth', async (t) => {
  let observed;
  const upstream = http.createServer((req, res) => {
    observed = { url: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie };
    res.writeHead(200, { 'Content-Type': 'text/plain', 'WWW-Authenticate': 'Basic' });
    res.end('game');
  });
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({
    env: testEnv,
    slots: 1,
    upstream: `http://127.0.0.1:${upstreamPort}`,
    upstreamUser: 'secret-user',
    upstreamPassword: 'secret-pass',
    trustProxy: true
  });
  const port = await listen(server);
  t.after(() => Promise.all([close(server), close(upstream)]));

  const shell = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.10' } });
  const cookie = cookieFrom(shell);
  const proxied = await request(port, '/stream/assets/client.js?x=1', {
    headers: { Cookie: cookie, Authorization: 'Basic attacker' }
  });
  assert.equal(proxied.status, 200);
  assert.equal(proxied.body, 'game');
  assert.equal(proxied.headers['www-authenticate'], undefined);
  assert.equal(proxied.headers['x-frame-options'], undefined);
  assert.deepEqual(observed, {
    url: '/assets/client.js?x=1',
    authorization: `Basic ${Buffer.from('secret-user:secret-pass').toString('base64')}`,
    cookie: undefined
  });

  const denied = await request(port, '/stream/', {
    headers: { Cookie: `${COOKIE_NAME}=${'A'.repeat(43)}` }
  });
  assert.equal(denied.status, 403);
});

test('proxies active WebSocket upgrades with rewritten route and auth', async (t) => {
  let upgrade;
  const upstream = http.createServer();
  upstream.on('upgrade', (req, socket) => {
    upgrade = { url: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie };
    socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  });
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({
    env: testEnv,
    slots: 1,
    upstream: `http://127.0.0.1:${upstreamPort}`,
    upstreamUser: 'ws-user',
    upstreamPassword: 'ws-pass',
    trustProxy: true
  });
  const port = await listen(server);
  t.after(() => Promise.all([close(server), close(upstream)]));

  const shell = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.20' } });
  const cookie = cookieFrom(shell);
  const response = await new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(
        'GET /stream/api/websockets HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${port}\r\n` +
        'Connection: Upgrade\r\n' +
        'Upgrade: websocket\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        `Cookie: ${cookie}\r\n\r\n`
      );
    });
    socket.once('data', (data) => {
      resolve(data.toString());
      socket.destroy();
    });
    socket.on('error', reject);
  });
  assert.match(response, /^HTTP\/1\.1 101/);
  assert.deepEqual(upgrade, {
    url: '/api/websockets',
    authorization: `Basic ${Buffer.from('ws-user:ws-pass').toString('base64')}`,
    cookie: undefined
  });
});

test('admits several isolated sessions up to the slot cap', () => {
  const started = [];
  const stopped = [];
  const queue = new QueueManager({
    slots: 2,
    capacity: 5,
    runtime: {
      start(id) {
        started.push(id);
        return { target: `http://127.0.0.1/${id}`, containerId: id };
      },
      stop(session) {
        stopped.push(session.id);
      }
    }
  });

  assert.equal(queue.admit('a', '192.0.2.1').state, 'active');
  assert.equal(queue.admit('b', '192.0.2.2').state, 'active');
  assert.equal(queue.admit('c', '192.0.2.3').state, 'waiting');
  assert.equal(queue.getTarget('a'), 'http://127.0.0.1/a');
  assert.equal(queue.getTarget('b'), 'http://127.0.0.1/b');
  assert.deepEqual(started, ['a', 'b']);

  queue.reap('a');
  queue.maintain();
  assert.equal(queue.status('c').state, 'active');
  assert.deepEqual(stopped, ['a']);
  assert.deepEqual(started, ['a', 'b', 'c']);
});

test('allows more than one session from the same IP and recovers a lost cookie', () => {
  const queue = new QueueManager({
    slots: 4,
    maxPerIp: 4,
    runtime: {
      start(id) {
        return { target: `http://127.0.0.1/${id}` };
      },
      stop() {}
    }
  });

  assert.equal(queue.admit('a', '192.0.2.9').state, 'active');
  assert.equal(queue.admit('b', '192.0.2.9').state, 'active');
  assert.equal(queue.getTarget('a'), 'http://127.0.0.1/a');
  assert.equal(queue.getTarget('b'), 'http://127.0.0.1/b');

  const recovered = queue.heartbeat('lost-cookie', '192.0.2.8');
  assert.equal(recovered.state, 'absent');
  queue.admit('starter', '192.0.2.8');
  const afterCookieLoss = queue.heartbeat('new-cookie', '192.0.2.8');
  assert.equal(afterCookieLoss.state, 'active');
  assert.equal(queue.sessions.has('starter'), false);
  assert.equal(queue.isActive('new-cookie'), true);
});

test('exposes a starting state until the runtime becomes ready', async () => {
  let resolveStart;
  const queue = new QueueManager({
    slots: 1,
    runtime: {
      start() {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      },
      stop() {}
    }
  });

  assert.equal(queue.admit('a', '192.0.2.1').state, 'starting');
  assert.equal(queue.isActive('a'), false);
  resolveStart({ target: 'http://127.0.0.1:6080' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(queue.status('a').state, 'active');
  assert.equal(queue.isActive('a'), true);
});

test('reports allocator health with slot usage', async (t) => {
  const upstream = http.createServer((_req, res) => res.end('upstream'));
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({
    env: testEnv,
    slots: 8,
    upstream: `http://127.0.0.1:${upstreamPort}`,
    upstreamUser: 'private-user',
    upstreamPassword: 'private-password'
  });
  const port = await listen(server);
  t.after(() => Promise.all([close(server), close(upstream)]));

  const health = await request(port, '/healthz');
  assert.equal(health.status, 200);
  assert.match(health.body, /"allocator":"immediate"/);
  assert.match(health.body, /"slots":8/);
});

test('rejects swearing and leadership names and keeps ordinary racer names', () => {
  for (const name of ['Terminator', 'Ozan', '303', 'Miss Wong', 'MacAllister Jr.', 'Marshall']) {
    assert.equal(validateRacerName(name).ok, true, name);
  }
  for (const name of [
    'fuck', 'F*ck', 'shit', 'sh1t', 'asshole', 'Kim', 'Kimberly', 'Hakim',
    'Kim Jong Un', 'dear leader', 'supreme leader', '김정은'
  ]) {
    assert.equal(validateRacerName(name).ok, false, name);
  }
});

test('keeps only the fastest ten names', () => {
  const board = new Leaderboard();
  for (let index = 0; index < 10; index += 1) {
    const result = board.submit(`id-${index}`, {
      name: `Racer ${index}`,
      minutes: 10,
      seconds: 30 + index,
      sites: 8,
      warnings: 1
    });
    assert.equal(result.ok, true);
    assert.equal(result.rank, index + 1);
  }
  const missed = board.submit('slow', {
    name: 'Too Slow',
    minutes: 12,
    seconds: 0,
    sites: 10,
    warnings: 0
  });
  assert.equal(missed.ok, false);
  assert.equal(missed.error, 'not_ranked');
  assert.equal(board.list().length, 10);
  assert.equal(board.list()[0].name, 'Racer 0');

  const blocked = board.submit('rude', {
    name: 'fuck',
    minutes: 9,
    seconds: 0,
    sites: 10,
    warnings: 0
  });
  assert.equal(blocked.error, 'bad_name');
});

test('accepts a played session result and blocks names on the public API', async (t) => {
  const upstream = http.createServer((_req, res) => res.end('upstream'));
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({
    env: testEnv,
    slots: 1,
    minSubmitMs: 0,
    upstream: `http://127.0.0.1:${upstreamPort}`,
    upstreamUser: 'private-user',
    upstreamPassword: 'private-password',
    trustProxy: true
  });
  const port = await listen(server);
  t.after(() => Promise.all([close(server), close(upstream)]));

  const listed = await request(port, '/api/top10', {
    headers: { Origin: 'https://pyongyangracer.com' }
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers['access-control-allow-origin'], 'https://pyongyangracer.com');
  assert.match(listed.body, /"entries":\[\]/);

  const stranger = await request(port, '/api/top10', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '192.0.2.80' },
    body: JSON.stringify({
      name: 'Visitor',
      minutes: 10,
      seconds: 30,
      sites: 9,
      warnings: 1
    })
  });
  assert.equal(stranger.status, 403);
  assert.match(stranger.body, /play_required/);

  const shell = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.81' } });
  const cookie = cookieFrom(shell);
  const saved = await request(port, '/api/top10', {
    method: 'POST',
    headers: { Cookie: cookie, 'X-Forwarded-For': '192.0.2.81' },
    body: JSON.stringify({
      name: 'Sky Racer',
      minutes: 10,
      seconds: 12,
      sites: 9,
      warnings: 1
    })
  });
  assert.equal(saved.status, 200, saved.body);
  assert.match(saved.body, /"rank":1/);
  assert.match(saved.body, /Sky Racer/);

  const rude = await request(port, '/api/top10', {
    method: 'POST',
    headers: { Cookie: cookie, 'X-Forwarded-For': '192.0.2.81' },
    body: JSON.stringify({
      name: 'Kim',
      minutes: 9,
      seconds: 10,
      sites: 10,
      warnings: 0
    })
  });
  assert.equal(rude.status, 400);
  assert.match(rude.body, /bad_name/);
});

