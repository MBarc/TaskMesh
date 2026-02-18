import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, ThemeId } from '../types';
import { builtInThemes } from '../themes/themeDefinitions';
import type { ThemeDefinition } from '../themes/themeDefinitions';
import { injectAllThemeStyles } from '../themes/themeCSS';

// Derive the backward-compatible Theme[] array from built-in definitions
export const themes: Theme[] = builtInThemes.map((t) => ({
  id: t.id,
  name: t.name,
  isDark: t.isDark,
  color: t.colors['primary-500'],
}));

function injectAll(customThemes: ThemeDefinition[]) {
  injectAllThemeStyles([...builtInThemes, ...customThemes]);
}

interface ThemeState {
  themeId: ThemeId;
  customThemes: ThemeDefinition[];
  setTheme: (themeId: ThemeId) => void;
  currentTheme: () => Theme;
  allThemes: () => Theme[];
  addCustomTheme: (def: ThemeDefinition) => void;
  removeCustomTheme: (id: string) => void;
  saveStudioTheme: (def: ThemeDefinition, apply: boolean) => void;
  findCustomThemeByName: (name: string) => ThemeDefinition | undefined;
  overwriteCustomTheme: (existingId: string, def: ThemeDefinition, apply: boolean) => void;
  previewTheme: (def: ThemeDefinition) => void;
  clearPreview: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeId: 'default-light',
      customThemes: [],
      setTheme: (themeId) => {
        set({ themeId });
        document.documentElement.setAttribute('data-theme', themeId);
      },
      currentTheme: () => {
        const { themeId, customThemes } = get();
        const all = [
          ...themes,
          ...customThemes.map((t) => ({
            id: t.id,
            name: t.name,
            isDark: t.isDark,
            color: t.colors['primary-500'],
          })),
        ];
        return all.find((t) => t.id === themeId) || themes[0];
      },
      allThemes: () => {
        const { customThemes } = get();
        return [
          ...themes,
          ...customThemes.map((t) => ({
            id: t.id,
            name: t.name,
            isDark: t.isDark,
            color: t.colors['primary-500'],
          })),
        ];
      },
      addCustomTheme: (def) => {
        const id = `custom-${Date.now()}`;
        const themed: ThemeDefinition = { ...def, id };
        const updated = [...get().customThemes, themed];
        set({ customThemes: updated, themeId: id });
        injectAll(updated);
        document.documentElement.setAttribute('data-theme', id);
      },
      removeCustomTheme: (id) => {
        const updated = get().customThemes.filter((t) => t.id !== id);
        const needsFallback = get().themeId === id;
        set({
          customThemes: updated,
          ...(needsFallback ? { themeId: 'default-light' } : {}),
        });
        injectAll(updated);
        if (needsFallback) {
          document.documentElement.setAttribute('data-theme', 'default-light');
        }
      },
      saveStudioTheme: (def, apply) => {
        const id = `custom-${Date.now()}`;
        const themed: ThemeDefinition = { ...def, id };
        const updated = [...get().customThemes, themed];
        set({ customThemes: updated, ...(apply ? { themeId: id } : {}) });
        injectAll(updated);
        if (apply) {
          document.documentElement.setAttribute('data-theme', id);
        }
      },
      findCustomThemeByName: (name) => {
        return get().customThemes.find(
          (t) => t.name.toLowerCase() === name.toLowerCase()
        );
      },
      overwriteCustomTheme: (existingId, def, apply) => {
        const updated = get().customThemes.map((t) =>
          t.id === existingId ? { ...def, id: existingId } : t
        );
        set({ customThemes: updated, ...(apply ? { themeId: existingId } : {}) });
        injectAll(updated);
        if (apply) {
          document.documentElement.setAttribute('data-theme', existingId);
        }
      },
      previewTheme: (def) => {
        const previewId = '__studio-preview__';
        const previewDef: ThemeDefinition = { ...def, id: previewId };
        injectAll([...builtInThemes, ...get().customThemes, previewDef]);
        document.documentElement.setAttribute('data-theme', previewId);
      },
      clearPreview: () => {
        const { themeId, customThemes } = get();
        injectAll([...builtInThemes, ...customThemes]);
        document.documentElement.setAttribute('data-theme', themeId);
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          injectAll(state.customThemes);
          document.documentElement.setAttribute('data-theme', state.themeId);
        }
      },
    }
  )
);
