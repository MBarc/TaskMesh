import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { SHORTCUT_DEFS, useShortcutStore } from '../stores/shortcutStore';

interface Props {
  onClose: () => void;
}

function formatKey(key: string): string {
  return key
    .split('+')
    .map((part) => {
      switch (part) {
        case 'ctrl':   return 'Ctrl';
        case 'shift':  return 'Shift';
        case 'alt':    return 'Alt';
        case 'left':   return '←';
        case 'right':  return '→';
        case 'up':     return '↑';
        case 'down':   return '↓';
        case 'delete': return 'Del';
        case 'escape': return 'Esc';
        case 'enter':  return 'Enter';
        case 'arrows': return '↑ ↓ ← →';
        case 'click':  return 'Click';
        default:       return part.toUpperCase();
      }
    })
    .join('+');
}

export function KeyboardShortcutsModal({ onClose }: Props) {
  const [search, setSearch] = useState('');
  const overrides = useShortcutStore((s) => s.overrides);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const categories = [...new Set(SHORTCUT_DEFS.map((d) => d.category))] as Array<typeof SHORTCUT_DEFS[number]['category']>;

  const filtered = SHORTCUT_DEFS.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.description.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-tertiary text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shortcuts..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-surface-tertiary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
              autoFocus
            />
          </div>
        </div>

        {/* Shortcut list */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-5">
          {categories.map((category) => {
            const items = filtered.filter((d) => d.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                  {category}
                </h3>
                <div className="space-y-0.5">
                  {items.map((def) => {
                    const key = overrides[def.id] ?? def.defaultKey;
                    const isOverridden = !!overrides[def.id];
                    return (
                      <div key={def.id} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-text-primary">{def.description}</span>
                        <div className="flex items-center gap-2">
                          {isOverridden && (
                            <span className="text-xs text-primary-500 font-medium">custom</span>
                          )}
                          <kbd className="px-2 py-0.5 text-xs font-mono bg-surface-tertiary border border-border rounded text-text-secondary whitespace-nowrap">
                            {formatKey(key)}
                          </kbd>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">No shortcuts found.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border text-xs text-text-muted text-center">
          Press{' '}
          <kbd className="px-1.5 py-0.5 font-mono bg-surface-tertiary border border-border rounded">
            Esc
          </kbd>{' '}
          to close
        </div>
      </div>
    </div>
  );
}
