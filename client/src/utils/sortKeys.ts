import type { Column } from '../types';

/** A cell's comparable value; null = empty cell, which always sorts last. */
export type SortKey = string | number | null;

/** Convert a raw cell value to its sort key once, instead of on every comparison. */
export function cellSortKey(raw: string | undefined, col: Pick<Column, 'type' | 'options'>): SortKey {
  if (!raw) return null;
  const label = (id: string) => col.options.find((o) => o.id === id)?.value;
  switch (col.type) {
    case 'NUMBER':
      return parseFloat(raw) || 0;
    case 'CHECKBOX':
      return raw === 'true' ? 1 : 0;
    case 'DROPDOWN':
      return label(raw) || raw;
    case 'MULTI_SELECT':
      try {
        return (JSON.parse(raw) as string[]).map((id) => label(id) || '').join(', ');
      } catch {
        return '';
      }
    case 'SOURCE':
      try {
        return (JSON.parse(raw) as { platform?: string }).platform || '';
      } catch {
        return '';
      }
    default:
      return raw;
  }
}

export function compareSortKeys(a: SortKey, b: SortKey, direction: 'asc' | 'desc'): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1; // empties sink in both directions
  const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
  return direction === 'asc' ? cmp : -cmp;
}
