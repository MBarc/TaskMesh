import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupSqlite } from './dbBackup.js';

test('backs up the db and keeps only the newest 3 copies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-backup-'));
  const db = path.join(dir, 'taskmesh.db');
  assert.equal(backupSqlite(db), null); // fresh install: nothing to back up

  fs.writeFileSync(db, 'v1');
  for (let i = 0; i < 5; i++) backupSqlite(db, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
  const backups = fs.readdirSync(dir).filter((f) => f.includes('.backup-')).sort();
  assert.equal(backups.length, 3);
  assert.ok(backups[0].includes('00-00-02'), backups[0]); // oldest two were pruned
  assert.equal(fs.readFileSync(path.join(dir, backups[2]), 'utf8'), 'v1');
  fs.rmSync(dir, { recursive: true, force: true });
});
