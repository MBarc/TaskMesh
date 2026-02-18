import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiPrefsState {
  showNewBadge: boolean;
  setShowNewBadge: (value: boolean) => void;
}

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      showNewBadge: true,
      setShowNewBadge: (value) => set({ showNewBadge: value }),
    }),
    {
      name: 'ui-prefs-storage',
    }
  )
);
