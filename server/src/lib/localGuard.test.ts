import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { isAllowedHost, isAllowedOrigin, localGuard } from './localGuard.js';

test('hosts', () => {
  for (const h of ['localhost', 'localhost:4000', 'taskmesh.localhost', 'TaskMesh.localhost:8080', '127.0.0.1:4000', '[::1]:4000']) {
    assert.ok(isAllowedHost(h), h);
  }
  for (const h of [undefined, '', 'evil.com', 'localhost.evil.com', '192.168.1.5:4000', '127.0.0.1.nip.io']) {
    assert.ok(!isAllowedHost(h), String(h));
  }
});

test('origins', () => {
  assert.ok(isAllowedOrigin(undefined));
  assert.ok(isAllowedOrigin('http://taskmesh.localhost'));
  assert.ok(isAllowedOrigin('http://localhost:5173'));
  assert.ok(!isAllowedOrigin('https://evil.com'));
  assert.ok(!isAllowedOrigin('null'));
});

test('middleware blocks foreign Host and Origin, passes local', async () => {
  const app = express();
  app.use(localGuard);
  app.post('/api/x', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;

  const status = (headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      http.request({ host: '127.0.0.1', port, path: '/api/x', method: 'POST', headers }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      }).on('error', reject).end();
    });

  try {
    assert.equal(await status({ Host: `localhost:${port}` }), 200);
    assert.equal(await status({ Host: 'taskmesh.localhost', Origin: 'http://taskmesh.localhost' }), 200);
    assert.equal(await status({ Host: 'attacker.example' }), 403); // DNS rebinding
    assert.equal(await status({ Host: 'localhost', Origin: 'https://attacker.example' }), 403); // drive-by page
  } finally {
    server.close();
  }
});
