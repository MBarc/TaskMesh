import { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { THEME_COLOR_KEYS } from '../themes/themeDefinitions';
import type { ThemeColorMap } from '../themes/themeDefinitions';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface CustomThemeImportProps {
  onClose: () => void;
}

function validate(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'Input must be a JSON object.';
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    return '"name" must be a non-empty string.';
  }
  if (typeof obj.isDark !== 'boolean') {
    return '"isDark" must be a boolean (true or false).';
  }
  if (typeof obj.colors !== 'object' || obj.colors === null || Array.isArray(obj.colors)) {
    return '"colors" must be an object with 18 color keys.';
  }

  const colors = obj.colors as Record<string, unknown>;
  for (const key of THEME_COLOR_KEYS) {
    if (!(key in colors)) {
      return `Missing color key: "${key}".`;
    }
    const val = colors[key];
    if (typeof val !== 'string' || !HEX_RE.test(val)) {
      return `Invalid hex value for "${key}". Expected format: #RRGGBB.`;
    }
  }

  return null;
}

export function CustomThemeImport({ onClose }: CustomThemeImportProps) {
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addCustomTheme = useThemeStore((s) => s.addCustomTheme);

  const handleImport = () => {
    setError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError('Invalid JSON. Please check your syntax.');
      return;
    }

    const validationError = validate(parsed);
    if (validationError) {
      setError(validationError);
      return;
    }

    const obj = parsed as { name: string; isDark: boolean; colors: ThemeColorMap };
    addCustomTheme({
      id: '', // addCustomTheme will assign the real ID
      name: obj.name.trim(),
      isDark: obj.isDark,
      colors: obj.colors,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-lg shadow-xl border border-border w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">Import Custom Theme</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-tertiary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-text-secondary">
            Paste a theme JSON object with <code className="text-primary-500">name</code>,{' '}
            <code className="text-primary-500">isDark</code>, and{' '}
            <code className="text-primary-500">colors</code> (18 hex values).
          </p>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={12}
            placeholder={'{\n  "name": "My Theme",\n  "isDark": false,\n  "colors": {\n    "primary-50": "#f0f9ff",\n    "primary-100": "#e0f2fe",\n    "primary-200": "#bae6fd",\n    "primary-300": "#7dd3fc",\n    "primary-400": "#38bdf8",\n    "primary-500": "#0ea5e9",\n    "primary-600": "#0284c7",\n    "primary-700": "#0369a1",\n    "primary-800": "#075985",\n    "primary-900": "#0c4a6e",\n    "surface": "#ffffff",\n    "surface-secondary": "#f8fafc",\n    "surface-tertiary": "#f1f5f9",\n    "border": "#e2e8f0",\n    "border-secondary": "#cbd5e1",\n    "text-primary": "#0f172a",\n    "text-secondary": "#475569",\n    "text-muted": "#94a3b8"\n  }\n}'}
            className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
          />
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded-md hover:bg-surface-tertiary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
