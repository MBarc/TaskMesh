import { create } from 'zustand';
import type { Theme, ThemeId } from '../types';
import { builtInThemes } from '../themes/themeDefinitions';
import type { ThemeDefinition } from '../themes/themeDefinitions';
import { injectAllThemeStyles } from '../themes/themeCSS';
import * as api from '../api';

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

function toTheme(t: ThemeDefinition): Theme {
  return { id: t.id, name: t.name, isDark: t.isDark, color: t.colors['primary-500'] };
}

interface ThemeState {
  themeId: ThemeId;
  customThemes: ThemeDefinition[];
  setTheme: (themeId: ThemeId) => void;
  currentTheme: () => Theme;
  allThemes: () => Theme[];
  initialize: () => Promise<void>;
  addCustomTheme: (def: ThemeDefinition) => Promise<void>;
  removeCustomTheme: (id: string) => Promise<void>;
  saveStudioTheme: (def: ThemeDefinition, apply: boolean) => Promise<void>;
  findCustomThemeByName: (name: string) => ThemeDefinition | undefined;
  overwriteCustomTheme: (existingId: string, def: ThemeDefinition, apply: boolean) => Promise<void>;
  previewTheme: (def: ThemeDefinition) => void;
  clearPreview: () => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
      themeId: 'default-light',
      customThemes: [],
      setTheme: (themeId) => {
        set({ themeId });
        document.documentElement.setAttribute('data-theme', themeId);
        api.updateAppSettings({ activeThemeId: themeId }).catch(() => {});
      },
      currentTheme: () => {
        const { themeId, customThemes } = get();
        const all = [...themes, ...customThemes.map(toTheme)];
        return all.find((t) => t.id === themeId) || themes[0];
      },
      allThemes: () => {
        const { customThemes } = get();
        return [...themes, ...customThemes.map(toTheme)];
      },
      initialize: async () => {
        const [fetched, settings] = await Promise.all([
          api.getCustomThemes(),
          api.getAppSettings(),
        ]);
        const themeId = (settings.activeThemeId || 'default-light') as ThemeId;
        set({ customThemes: fetched, themeId });
        injectAll(fetched);
        document.documentElement.setAttribute('data-theme', themeId);
      },
      addCustomTheme: async (def) => {
        const created = await api.createCustomTheme(def);
        const updated = [...get().customThemes, created];
        set({ customThemes: updated, themeId: created.id });
        injectAll(updated);
        document.documentElement.setAttribute('data-theme', created.id);
        api.updateAppSettings({ activeThemeId: created.id }).catch(() => {});
      },
      removeCustomTheme: async (id) => {
        await api.deleteCustomTheme(id);
        const updated = get().customThemes.filter((t) => t.id !== id);
        const needsFallback = get().themeId === id;
        set({
          customThemes: updated,
          ...(needsFallback ? { themeId: 'default-light' } : {}),
        });
        injectAll(updated);
        if (needsFallback) {
          document.documentElement.setAttribute('data-theme', 'default-light');
          api.updateAppSettings({ activeThemeId: 'default-light' }).catch(() => {});
        }
      },
      saveStudioTheme: async (def, apply) => {
        const created = await api.createCustomTheme(def);
        const updated = [...get().customThemes, created];
        set({ customThemes: updated, ...(apply ? { themeId: created.id } : {}) });
        injectAll(updated);
        if (apply) {
          document.documentElement.setAttribute('data-theme', created.id);
          api.updateAppSettings({ activeThemeId: created.id }).catch(() => {});
        }
      },
      findCustomThemeByName: (name) => {
        return get().customThemes.find(
          (t) => t.name.toLowerCase() === name.toLowerCase()
        );
      },
      overwriteCustomTheme: async (existingId, def, apply) => {
        const updated_def = await api.updateCustomTheme(existingId, def);
        const updated = get().customThemes.map((t) =>
          t.id === existingId ? updated_def : t
        );
        set({ customThemes: updated, ...(apply ? { themeId: existingId } : {}) });
        injectAll(updated);
        if (apply) {
          document.documentElement.setAttribute('data-theme', existingId);
          api.updateAppSettings({ activeThemeId: existingId }).catch(() => {});
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
    }));
