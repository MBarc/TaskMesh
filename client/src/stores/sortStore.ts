import { create } from 'zustand';
import * as api from '../api';

export interface SortConfig {
  columnId: string;
  direction: 'asc' | 'desc';
}

interface SortState {
  boardSorts: Record<string, SortConfig[]>;
  initialize: () => Promise<void>;
  toggleSort: (boardId: string, columnId: string) => Promise<void>;
  clearSort: (boardId: string) => Promise<void>;
}

export const useSortStore = create<SortState>()((set, get) => ({
  boardSorts: {},
  initialize: async () => {
    const boardSorts = await api.getBoardSorts();
    set({ boardSorts: boardSorts as Record<string, SortConfig[]> });
  },
  toggleSort: async (boardId, columnId) => {
    const current = get().boardSorts[boardId] || [];
    const existing = current.find((s) => s.columnId === columnId);
    let next: SortConfig[];
    if (!existing) {
      next = [...current, { columnId, direction: 'asc' }];
    } else if (existing.direction === 'asc') {
      next = current.map((s) =>
        s.columnId === columnId ? { ...s, direction: 'desc' as const } : s
      );
    } else {
      next = current.filter((s) => s.columnId !== columnId);
    }
    set((state) => ({ boardSorts: { ...state.boardSorts, [boardId]: next } }));
    await api.setBoardSorts(boardId, next);
  },
  clearSort: async (boardId) => {
    set((state) => ({ boardSorts: { ...state.boardSorts, [boardId]: [] } }));
    await api.deleteBoardSorts(boardId);
  },
}));
