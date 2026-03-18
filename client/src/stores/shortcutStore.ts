import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShortcutDef {
  id: string;
  defaultKey: string;
  description: string;
  category: 'Global' | 'Board Navigation' | 'Table Navigation' | 'Task' | 'AI';
  overridable?: boolean; // false = display-only reference, cannot be rebound
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { id: 'global-search',  defaultKey: 'ctrl+k',       description: 'Open global search',                category: 'Global' },
  { id: 'new-task',       defaultKey: 'ctrl+n',       description: 'Create new task',                   category: 'Global' },
  { id: 'new-board',      defaultKey: 'ctrl+b',       description: 'Create new board',                  category: 'Global' },
  { id: 'show-shortcuts', defaultKey: 'ctrl+/',       description: 'Open keyboard shortcuts reference',  category: 'Global' },
  { id: 'prev-board',     defaultKey: 'ctrl+left',    description: 'Go to previous board',              category: 'Board Navigation' },
  { id: 'next-board',     defaultKey: 'ctrl+right',   description: 'Go to next board',                  category: 'Board Navigation' },
  { id: 'board-1',        defaultKey: 'ctrl+1',       description: 'Jump to board 1',                   category: 'Board Navigation' },
  { id: 'board-2',        defaultKey: 'ctrl+2',       description: 'Jump to board 2',                   category: 'Board Navigation' },
  { id: 'board-3',        defaultKey: 'ctrl+3',       description: 'Jump to board 3',                   category: 'Board Navigation' },
  { id: 'board-4',        defaultKey: 'ctrl+4',       description: 'Jump to board 4',                   category: 'Board Navigation' },
  { id: 'board-5',        defaultKey: 'ctrl+5',       description: 'Jump to board 5',                   category: 'Board Navigation' },
  { id: 'board-6',        defaultKey: 'ctrl+6',       description: 'Jump to board 6',                   category: 'Board Navigation' },
  { id: 'board-7',        defaultKey: 'ctrl+7',       description: 'Jump to board 7',                   category: 'Board Navigation' },
  { id: 'board-8',        defaultKey: 'ctrl+8',       description: 'Jump to board 8',                   category: 'Board Navigation' },
  { id: 'board-9',        defaultKey: 'ctrl+9',       description: 'Jump to board 9',                   category: 'Board Navigation' },
  { id: 'nav-arrows',       defaultKey: 'arrows', description: 'Navigate table cells',                  category: 'Table Navigation', overridable: false },
  { id: 'nav-enter',        defaultKey: 'enter',  description: 'Edit focused cell / trigger its action', category: 'Table Navigation', overridable: false },
  { id: 'nav-edit-text',    defaultKey: 'e',      description: 'Edit first text column of row',         category: 'Table Navigation', overridable: false },
  { id: 'nav-escape',       defaultKey: 'escape', description: 'Clear focus / cancel drag',             category: 'Table Navigation', overridable: false },
  { id: 'nav-drag-arrows',  defaultKey: 'arrows', description: 'Reorder row or column (drag mode)',     category: 'Table Navigation', overridable: false },
  { id: 'nav-drag-confirm', defaultKey: 'enter',  description: 'Confirm reorder (drag mode)',           category: 'Table Navigation', overridable: false },
  { id: 'select-rows',    defaultKey: 'ctrl+click',   description: 'Select / deselect a row',            category: 'Task', overridable: false },
  { id: 'range-select',   defaultKey: 'shift+click',  description: 'Range-select rows',                  category: 'Task', overridable: false },
  { id: 'select-all',     defaultKey: 'ctrl+a',       description: 'Select all tasks',                   category: 'Task', overridable: false },
  { id: 'delete-task',    defaultKey: 'delete',       description: 'Delete focused / selected task(s)',  category: 'Task' },
  { id: 'duplicate-task', defaultKey: 'd',             description: 'Duplicate focused / selected task(s)', category: 'Task' },
  { id: 'ai-extract',     defaultKey: 'ctrl+shift+e', description: 'Open AI extraction panel',          category: 'AI' },
];

interface ShortcutStore {
  overrides: Record<string, string>;
  setOverride: (id: string, key: string) => void;
  resetOverride: (id: string) => void;
  resetAll: () => void;
}

// Accepts both DOM KeyboardEvent and React.KeyboardEvent
export function normalizeKey(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
}): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');

  const keyMap: Record<string, string> = {
    ArrowLeft:  'left',
    ArrowRight: 'right',
    ArrowUp:    'up',
    ArrowDown:  'down',
    Delete:     'delete',
    Escape:     'escape',
    Enter:      'enter',
  };
  const key = keyMap[e.key] ?? e.key.toLowerCase();
  parts.push(key);
  return parts.join('+');
}

export const useShortcutStore = create<ShortcutStore>()(
  persist(
    (set) => ({
      overrides: {},
      setOverride: (id, key) =>
        set((state) => ({ overrides: { ...state.overrides, [id]: key } })),
      resetOverride: (id) =>
        set((state) => {
          const next = { ...state.overrides };
          delete next[id];
          return { overrides: next };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    { name: 'shortcut-storage' }
  )
);
