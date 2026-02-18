import { create } from 'zustand';
import type { ArchiveSettings, ArchivedTaskGroup } from '../types';
import * as api from '../api';

interface ArchiveState {
  settings: ArchiveSettings | null;
  groups: ArchivedTaskGroup[];
  loading: boolean;
  error: string | null;

  fetchSettings: () => Promise<void>;
  updateSettings: (data: Partial<ArchiveSettings>) => Promise<void>;
  fetchArchivedTasks: () => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

export const useArchiveStore = create<ArchiveState>((set) => ({
  settings: null,
  groups: [],
  loading: false,
  error: null,

  fetchSettings: async () => {
    try {
      const settings = await api.getArchiveSettings();
      set({ settings });
    } catch {
      set({ error: 'Failed to fetch archive settings' });
    }
  },

  updateSettings: async (data: Partial<ArchiveSettings>) => {
    try {
      const settings = await api.updateArchiveSettings(data);
      set({ settings });
      // If archive was disabled, clear groups
      if (data.archiveEnabled === false) {
        set({ groups: [] });
      }
    } catch {
      set({ error: 'Failed to update archive settings' });
    }
  },

  fetchArchivedTasks: async () => {
    set({ loading: true, error: null });
    try {
      const { groups } = await api.getArchivedTasks();
      set({ groups, loading: false });
    } catch {
      set({ error: 'Failed to fetch archived tasks', loading: false });
    }
  },

  restoreTask: async (id: string) => {
    try {
      await api.restoreArchivedTask(id);
      // Remove from local state
      set((state) => ({
        groups: state.groups
          .map((g) => ({
            ...g,
            tasks: g.tasks.filter((t) => t.id !== id),
          }))
          .filter((g) => g.tasks.length > 0),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore task';
      set({ error: message });
      throw err;
    }
  },

  deleteTask: async (id: string) => {
    try {
      await api.deleteArchivedTask(id);
      set((state) => ({
        groups: state.groups
          .map((g) => ({
            ...g,
            tasks: g.tasks.filter((t) => t.id !== id),
          }))
          .filter((g) => g.tasks.length > 0),
      }));
    } catch {
      set({ error: 'Failed to delete archived task' });
    }
  },
}));
