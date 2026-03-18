import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, Sparkles, Save, Check, X, Loader2, Wand2, AlertTriangle } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { builtInThemes, THEME_COLOR_KEYS } from '../themes/themeDefinitions';
import type { ThemeColorMap, ThemeDefinition } from '../themes/themeDefinitions';
import { generateThemeColors } from '../api';

interface ThemeStudioProps {
  onClose: () => void;
}


const COLOR_GROUPS: { label: string; keys: (keyof ThemeColorMap)[] }[] = [
  {
    label: 'Surfaces',
    keys: ['surface', 'surface-secondary', 'surface-tertiary'],
  },
  {
    label: 'Borders',
    keys: ['border', 'border-secondary'],
  },
  {
    label: 'Typography',
    keys: ['text-primary', 'text-secondary', 'text-muted'],
  },
];

function formatKeyFull(key: string): string {
  return key
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

type OverwriteState = { name: string; existingId: string; apply: boolean } | null;

export function ThemeStudio({ onClose }: ThemeStudioProps) {
  const [themeName, setThemeName] = useState('');
  const [colors, setColors] = useState<ThemeColorMap>(() => {
    const { themeId, customThemes } = useThemeStore.getState();
    const active = [...builtInThemes, ...customThemes].find(t => t.id === themeId);
    return { ...(active?.colors ?? builtInThemes[0].colors) };
  });
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState<OverwriteState>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const previewTimeout = useRef<ReturnType<typeof setTimeout>>();

  const { previewTheme, clearPreview, saveStudioTheme, findCustomThemeByName, overwriteCustomTheme } = useThemeStore();

  const buildDef = useCallback((): ThemeDefinition => ({
    id: '',
    name: themeName.trim(),
    isDark: false,
    colors,
  }), [themeName, colors]);

  // Real-time preview whenever colors change
  useEffect(() => {
    clearTimeout(previewTimeout.current);
    previewTimeout.current = setTimeout(() => {
      previewTheme(buildDef());
    }, 30);
    return () => clearTimeout(previewTimeout.current);
  }, [colors, previewTheme, buildDef]);

  // Revert preview on unmount
  useEffect(() => {
    return () => clearPreview();
  }, [clearPreview]);

  const handleColorChange = (key: keyof ThemeColorMap, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setAiError(null);
    try {
      const result = await generateThemeColors(aiPrompt.trim());
      const newColors = { ...colors };
      for (const key of THEME_COLOR_KEYS) {
        if (result.colors[key]) {
          newColors[key] = result.colors[key];
        }
      }
      setColors(newColors);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate theme. Check that the AI service is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  const canSave = themeName.trim().length > 0;

  const handleSave = async (apply: boolean) => {
    setSaveError(null);
    setSavedMessage(null);

    if (!canSave) {
      setSaveError('Please enter a theme name.');
      return;
    }

    const existing = findCustomThemeByName(themeName.trim());
    if (existing) {
      setOverwrite({ name: themeName.trim(), existingId: existing.id, apply });
      return;
    }

    try {
      await saveStudioTheme(buildDef(), apply);
      setSavedMessage(apply ? 'Theme saved and applied!' : 'Theme saved!');
      setTimeout(() => setSavedMessage(null), 3000);
    } catch {
      setSaveError('Failed to save theme. Please try again.');
    }
  };

  const confirmOverwrite = async () => {
    if (!overwrite) return;
    try {
      await overwriteCustomTheme(overwrite.existingId, buildDef(), overwrite.apply);
      setSavedMessage(overwrite.apply ? 'Theme overwritten and applied!' : 'Theme overwritten!');
      setOverwrite(null);
      setTimeout(() => setSavedMessage(null), 3000);
    } catch {
      setSaveError('Failed to save theme. Please try again.');
      setOverwrite(null);
    }
  };

  const handleClose = () => {
    clearPreview();
    onClose();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button
            onClick={handleClose}
            className="mt-0.5 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-tertiary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-text-primary tracking-tight">
              Theme Studio
            </h2>
            <p className="text-sm text-text-muted mt-0.5">
              Craft a custom color palette — describe a vibe or pick colors by hand
            </p>
          </div>
        </div>
      </div>

      {/* Theme Name */}
      <div className="bg-surface-secondary rounded-lg border border-border p-4">
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Theme Name
        </label>
        <input
          type="text"
          value={themeName}
          onChange={(e) => { setThemeName(e.target.value); setSaveError(null); }}
          placeholder="e.g. Midnight Aurora"
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
        />
      </div>

      {/* AI Generation */}
      <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary-500/10 flex items-center justify-center">
            <Wand2 className="w-3.5 h-3.5 text-primary-500" />
          </div>
          <h3 className="text-sm font-medium text-text-primary">
            AI Color Generator
          </h3>
          <span className="text-xs font-medium text-primary-500 bg-primary-500/10 px-1.5 py-0.5 rounded">
            Beta
          </span>
          <span className="text-xs text-text-muted ml-1">
            Describe a mood, memory, or aesthetic
          </span>
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isGenerating) handleGenerate(); }}
              placeholder="e.g. &quot;Calm ocean sunset&quot; or &quot;Birthday cake when I was 12&quot;"
              disabled={isGenerating}
              className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 transition-shadow"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !aiPrompt.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
          {aiError && (
            <p className="mt-2 text-xs text-red-500">{aiError}</p>
          )}
        </div>
      </div>

      {/* Color Pickers */}
      <div className="space-y-4">
        {COLOR_GROUPS.map((group) => (
          <div key={group.label} className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {group.label}
              </h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {group.keys.map((key) => (
                  <ColorSwatch
                    key={key}
                    colorKey={key}
                    value={colors[key]}
                    onChange={handleColorChange}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Overwrite confirmation */}
      {overwrite && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">
              A theme named "{overwrite.name}" already exists
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Do you want to overwrite it with the current colors?
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={confirmOverwrite}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Overwrite
              </button>
              <button
                onClick={() => setOverwrite(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-100 rounded-md hover:bg-amber-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="bg-surface-secondary rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-h-[28px]">
            {saveError && (
              <p className="text-xs text-red-500">{saveError}</p>
            )}
            {savedMessage && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <Check className="w-3.5 h-3.5" />
                {savedMessage}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-md hover:bg-surface-tertiary transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border border-border text-text-primary hover:bg-surface-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-4 h-4" />
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── Color Swatch Picker ─── */

interface ColorSwatchProps {
  colorKey: keyof ThemeColorMap;
  value: string;
  onChange: (key: keyof ThemeColorMap, value: string) => void;
}

function ColorSwatch({ colorKey, value, onChange }: ColorSwatchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [textValue, setTextValue] = useState(value);

  useEffect(() => {
    setTextValue(value);
  }, [value]);

  const handleTextChange = (raw: string) => {
    setTextValue(raw);
    const v = raw.startsWith('#') ? raw : `#${raw}`;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      onChange(colorKey, v);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-md hover:bg-surface-tertiary transition-colors group">
      <button
        onClick={() => inputRef.current?.click()}
        className="w-10 h-10 rounded-lg border border-border shadow-sm shrink-0 hover:ring-2 hover:ring-primary-500/30 transition-shadow cursor-pointer"
        style={{ backgroundColor: value }}
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(colorKey, e.target.value)}
        className="sr-only"
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">
          {formatKeyFull(colorKey)}
        </div>
        <input
          type="text"
          value={textValue}
          onChange={(e) => handleTextChange(e.target.value)}
          className="mt-0.5 w-full text-[11px] font-mono text-text-muted bg-transparent border-none outline-none p-0 focus:text-text-primary transition-colors"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
