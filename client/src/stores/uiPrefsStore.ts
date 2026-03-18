import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiPrefsState {
  showNewBadge: boolean;
  setShowNewBadge: (value: boolean) => void;
  favoriteBoardId: string | null;
  setFavoriteBoardId: (id: string | null) => void;
  // Non-persisted: increments each time Ctrl+B is pressed so BoardSelector can react
  newBoardSignal: number;
  triggerNewBoard: () => void;
}

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      showNewBadge: true,
      setShowNewBadge: (value) => set({ showNewBadge: value }),
      favoriteBoardId: null,
      setFavoriteBoardId: (id) => set({ favoriteBoardId: id }),
      newBoardSignal: 0,
      triggerNewBoard: () => set((s) => ({ newBoardSignal: s.newBoardSignal + 1 })),
    }),
    {
      name: 'ui-prefs-storage',
      // Only persist user preferences; newBoardSignal is transient
      partialize: (state) => ({
        showNewBadge: state.showNewBadge,
        favoriteBoardId: state.favoriteBoardId,
      }),
    }
  )
);
