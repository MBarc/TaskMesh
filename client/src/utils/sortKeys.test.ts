// Run: npm test (node --test with built-in TypeScript type stripping)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellSortKey, compareSortKeys, type SortKey } from './sortKeys.ts';

const opts = [{ id: 'a', value: 'Zebra' }, { id: 'b', value: 'Apple' }] as any;
const sortBy = (keys: SortKey[], dir: 'asc' | 'desc') => [...keys].sort((x, y) => compareSortKeys(x, y, dir));

test('keys per column type', () => {
  assert.equal(cellSortKey('', { type: 'TEXT', options: [] } as any), null);
  assert.equal(cellSortKey('10', { type: 'NUMBER', options: [] } as any), 10);
  assert.equal(cellSortKey('true', { type: 'CHECKBOX', options: [] } as any), 1);
  assert.equal(cellSortKey('a', { type: 'DROPDOWN', options: opts } as any), 'Zebra');
  assert.equal(cellSortKey('["b","a"]', { type: 'MULTI_SELECT', options: opts } as any), 'Apple, Zebra');
  assert.equal(cellSortKey('{"platform":"ado"}', { type: 'SOURCE', options: [] } as any), 'ado');
  assert.equal(cellSortKey('not json', { type: 'SOURCE', options: [] } as any), '');
});

test('numbers sort numerically, empties last in both directions', () => {
  assert.deepEqual(sortBy([10, null, 9, 100], 'asc'), [9, 10, 100, null]);
  assert.deepEqual(sortBy([10, null, 9, 100], 'desc'), [100, 10, 9, null]);
  assert.deepEqual(sortBy(['b', null, 'a'], 'asc'), ['a', 'b', null]);
});
