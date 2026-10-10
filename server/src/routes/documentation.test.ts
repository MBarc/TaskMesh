import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { sanitizeFsName, isInside, contained } from './documentation.js';

test('contained() refuses paths that a link inside the wiki redirects outside', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-wiki-'));
  const root = path.join(tmp, 'wiki');
  const outside = path.join(tmp, 'outside');
  fs.mkdirSync(path.join(root, 'board'), { recursive: true });
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, 'board', 'evil'), 'junction'); // no admin needed on Windows
  try {
    assert.equal(contained(path.join(root, 'board', 'notes.md'), root), path.join(root, 'board', 'notes.md'));
    assert.ok(contained(path.join(root, 'new-board', 'sub', 'x.md'), root)); // not created yet: fine
    assert.throws(() => contained(path.join(root, 'board', 'evil'), root));
    assert.throws(() => contained(path.join(root, 'board', 'evil', 'x.md'), root));
    assert.throws(() => contained(path.join(root, 'board', 'evil', 'deeper', 'x.md'), root));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('contained() refuses everything when the wiki root (or a parent) is itself a link', () => {
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-wikiroot-')));
  const elsewhere = path.join(tmp, 'elsewhere');
  const data = path.join(tmp, 'data');
  fs.mkdirSync(path.join(elsewhere, 'board'), { recursive: true });
  fs.mkdirSync(data);
  fs.symlinkSync(elsewhere, path.join(data, 'documentation'), 'junction'); // root replaced by a junction
  fs.symlinkSync(data, path.join(tmp, 'linked-parent'), 'junction');      // root reached through a linked parent
  try {
    assert.throws(() => contained(path.join(data, 'documentation', 'board', 'x.md'), path.join(data, 'documentation')));
    const realRoot = path.join(data, 'real-docs');
    fs.mkdirSync(realRoot);
    assert.ok(contained(path.join(realRoot, 'x.md'), realRoot));
    assert.throws(() => contained(path.join(tmp, 'linked-parent', 'real-docs', 'x.md'), path.join(tmp, 'linked-parent', 'real-docs')));
    // an 8.3 short name or different case is not a link
    if (process.platform === 'win32' && fs.existsSync('C:\\PROGRA~1')) {
      assert.ok(contained('C:\\PROGRA~1\\x.md', 'C:\\PROGRA~1'));
      assert.ok(contained(path.join(realRoot.toUpperCase(), 'x.md'), realRoot.toUpperCase()));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('sanitizeFsName never yields a segment that leaves its parent', () => {
  for (const evil of ['..', '.', '...', ' .. ', '../x', '..\\x', 'a/b', '']) {
    const safe = sanitizeFsName(evil);
    assert.ok(!/^\.+$/.test(safe) && !/[/\\]/.test(safe) && safe.length > 0, `${JSON.stringify(evil)} -> ${safe}`);
    assert.ok(isInside('/wiki/board', path.join('/wiki/board', safe)), `${JSON.stringify(evil)} escapes`);
  }
  assert.equal(sanitizeFsName('Meeting notes'), 'Meeting notes');
  assert.equal(sanitizeFsName('..notes'), '..notes'); // dots plus text is an ordinary name
});

test('isInside', () => {
  const base = path.resolve('/wiki');
  assert.ok(isInside(base, path.join(base, 'a', 'b.md')));
  assert.ok(isInside(base, base));
  assert.ok(isInside(base, path.join(base, '..notes', 'x.md')));
  assert.ok(!isInside(base, path.join(base, '..', 'etc')));
  assert.ok(!isInside(base, base + '-evil' + path.sep + 'x.md')); // sibling with shared prefix
  assert.ok(!isInside(base, path.resolve('/elsewhere/x.md')));
});
