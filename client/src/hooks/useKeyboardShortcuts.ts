import { useEffect } from 'react';
import { useShortcutStore, SHORTCUT_DEFS, normalizeKey } from '../stores/shortcutStore';

/**
 * Registers global keyboard shortcut handlers.
 * Automatically skips when focus is inside an input, textarea, select, or contenteditable.
 * Reads key bindings from shortcutStore (supports per-user overrides).
 */
export function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  const overrides = useShortcutStore((s) => s.overrides);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Element;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const pressed = normalizeKey(e);

      for (const def of SHORTCUT_DEFS) {
        const handler = handlers[def.id];
        if (!handler) continue;
        const resolvedKey = overrides[def.id] ?? def.defaultKey;
        if (pressed === resolvedKey) {
          e.preventDefault();
          handler();
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlers, overrides]);
}
