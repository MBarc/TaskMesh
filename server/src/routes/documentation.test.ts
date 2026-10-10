import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sanitizeFsName, isInside } from './documentation.js';

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
