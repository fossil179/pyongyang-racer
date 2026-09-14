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
  createGateway
} = require('../server');

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
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
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
    req.end();
  });
}

function cookieFrom(response) {
  return response.headers['set-cookie'][0].split(';', 1)[0];
}

test('serves anonymous shell and queues visitors in order', async (t) => {
  const upstream = http.createServer((_req, res) => res.end('upstream'));
  const upstreamPort = await listen(upstream);
  const { server } = createGateway({
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
  assert.equal(active.headers['www-authenticate'], undefined);
  assert.match(active.headers['set-cookie'][0], new RegExp(`^${COOKIE_NAME}=`));
  assert.match(active.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Lax/);
  assert.match(
    active.headers['content-security-policy'],
    /frame-ancestors 'self' https:\/\/pyongyangracer\.com/
  );
  assert.equal(active.headers['x-frame-options'], undefined);

  const next = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.2' } });
  assert.equal(next.status, 200);
  assert.ok(next.body.includes(NEXT_MESSAGE));

  const later = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.3' } });
  assert.match(later.body, /number 2 in the queue/);

  const duplicateIp = await request(port, '/', { headers: { 'X-Forwarded-For': '192.0.2.2' } });
  assert.equal(duplicateIp.status, 429);
  assert.match(duplicateIp.body, /already has an active or waiting player/);
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
