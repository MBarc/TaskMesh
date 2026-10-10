import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSON_FIELDS, encodeFields, decodeFields } from './prisma.js';

test('JSON_FIELDS matches every Json field in schema.prisma', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const found: Record<string, string[]> = {};
  let model = '';
  for (const line of schema.split('\n')) {
    const m = line.match(/^model\s+(\w+)/);
    if (m) model = m[1];
    const f = line.match(/^\s+(\w+)\s+Json\??(\s|$)/);
    if (f) (found[model] ??= []).push(f[1]);
  }
  assert.deepEqual(found, JSON_FIELDS);
});

test('encode/decode round-trip', () => {
  const row: any = { scopes: ['boards:read'], name: 'k', config: null };
  encodeFields(['scopes', 'config'], row);
  assert.equal(row.scopes, '["boards:read"]');
  assert.equal(row.config, null);
  decodeFields(['scopes', 'config'], row);
  assert.deepEqual(row.scopes, ['boards:read']);
  const legacy: any = { config: 'not json' };
  decodeFields(['config'], legacy);
  assert.equal(legacy.config, 'not json');
});
