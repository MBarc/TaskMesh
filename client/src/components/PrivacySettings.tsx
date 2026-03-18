import { useEffect, useState } from 'react';
import * as api from '../api';

interface AppSettings {
  telemetryEnabled: boolean;
}

export function PrivacySettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getAppSettings().then(setSettings).catch(() => {
      setSettings({ telemetryEnabled: false });
    });
  }, []);

  async function toggleTelemetry() {
    if (!settings) return;
    const next = !settings.telemetryEnabled;
    setSaving(true);
    try {
      const updated = await api.updateAppSettings({ telemetryEnabled: next });
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="bg-surface-secondary rounded-lg p-4 border border-border animate-pulse h-24" />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-1">Usage Data</h3>
        <p className="text-xs text-text-muted mb-4">
          Share anonymous usage data to help improve TaskMesh. Only behavioral signals
          like which features are used are collected. No task content, board names, or
          personal information is ever sent.{' '}
          <a
            href="https://taskmesh.co/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 hover:underline"
          >
            Privacy policy
          </a>
        </p>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">
            Share anonymous usage data to help improve TaskMesh
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.telemetryEnabled}
            onClick={toggleTelemetry}
            disabled={saving}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              settings.telemetryEnabled ? 'bg-primary-500' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                settings.telemetryEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="bg-surface-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-3">What we collect</h3>
        <ul className="space-y-1.5 text-xs text-text-muted">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            Feature usage signals (e.g. "AI extraction used", "board created")
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            App version and startup events
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            A random install ID (never linked to your identity)
          </li>
        </ul>
        <h3 className="text-sm font-medium text-text-primary mt-4 mb-3">What we never collect</h3>
        <ul className="space-y-1.5 text-xs text-text-muted">
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">✗</span>
            Task titles, descriptions, or any content you write
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">✗</span>
            Board or column names
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">✗</span>
            Connector credentials or configuration
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">✗</span>
            Any personally identifiable information
          </li>
        </ul>
      </div>
    </div>
  );
}
