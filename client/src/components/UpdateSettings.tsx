import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, RefreshCw, Download } from 'lucide-react';
import * as api from '../api';

type ApplyState = 'idle' | 'applying' | 'waiting' | 'done';

export function UpdateSettings() {
  const [status, setStatus] = useState<api.UpdateStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState>('idle');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getUpdateStatus().then(setStatus).catch(() => setError(true));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleCheckNow() {
    setChecking(true);
    try {
      const updated = await api.checkForUpdates();
      setStatus(updated);
    } finally {
      setChecking(false);
    }
  }

  async function handleDownloadNow() {
    setApplyError(null);
    setApplyState('applying');
    try {
      await api.applyUpdate();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Update failed');
      setApplyState('idle');
      return;
    }

    // Server will restart — poll /health until it comes back, then reload
    setApplyState('waiting');
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/health');
        if (res.ok) {
          clearInterval(pollRef.current!);
          setApplyState('done');
          // Brief pause so the user sees "Restarting…" before reload
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch {
        // Server still down — keep polling (up to ~3 minutes)
        if (attempts > 90) {
          clearInterval(pollRef.current!);
          setApplyError('Server did not restart in time. Please refresh the page manually.');
          setApplyState('idle');
        }
      }
    }, 2000);
  }

  async function toggleAutoUpdate() {
    if (!status) return;
    const next = !status.autoUpdateEnabled;
    setSaving(true);
    try {
      await api.updateAppSettings({ autoUpdateEnabled: next });
      setStatus(prev => prev ? { ...prev, autoUpdateEnabled: next } : prev);
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="bg-surface-secondary rounded-lg p-4 border border-border">
        <p className="text-sm text-text-muted">Unable to load update information.</p>
      </div>
    );
  }

  if (!status) {
    return <div className="bg-surface-secondary rounded-lg p-4 border border-border animate-pulse h-24" />;
  }

  const checkedAtFormatted = status.checkedAt
    ? new Date(status.checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const isApplying = applyState === 'applying' || applyState === 'waiting' || applyState === 'done';

  return (
    <div className="space-y-4">
      {/* Applying overlay card */}
      {isApplying && (
        <div className="bg-primary-500/10 border border-primary-500/30 rounded-lg p-4 flex items-start gap-3">
          <RefreshCw className="w-4 h-4 text-primary-500 shrink-0 mt-0.5 animate-spin" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              {applyState === 'applying' && 'Downloading update…'}
              {applyState === 'waiting' && 'Installing… TaskMesh will restart automatically'}
              {applyState === 'done' && 'Restarting…'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {applyState === 'applying' && 'Fetching the latest release from GitHub.'}
              {applyState === 'waiting' && "Don't close this tab — the page will reload when it's ready."}
              {applyState === 'done' && 'Almost there…'}
            </p>
          </div>
        </div>
      )}

      {/* Version info */}
      <div className="bg-surface-secondary rounded-lg p-4 border border-border space-y-3">
        <h3 className="text-sm font-medium text-text-primary">Version</h3>

        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Current version</span>
          <span className="text-text-primary font-mono">v{status.currentVersion}</span>
        </div>

        {status.latestVersion && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Latest version</span>
            <span className="text-text-primary font-mono">v{status.latestVersion}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            {status.updateAvailable ? (
              <>
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-sm text-amber-500">v{status.latestVersion} is available</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                <span className="text-sm text-text-muted">Up to date</span>
              </>
            )}
          </div>

          {status.updateAvailable && !isApplying && (
            <button
              type="button"
              onClick={handleDownloadNow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-md transition-colors"
            >
              <Download className="w-3 h-3" />
              Download now
            </button>
          )}
        </div>

        {applyError && (
          <p className="text-xs text-red-500">{applyError}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          {checkedAtFormatted ? (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <RefreshCw className="w-3 h-3" />
              <span>Last checked {checkedAtFormatted}</span>
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleCheckNow}
            disabled={checking || isApplying}
            className="flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-600 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>

      {/* Auto-update toggle */}
      <div className="bg-surface-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-1">Automatic Updates</h3>
        <p className="text-xs text-text-muted mb-4">
          When enabled, TaskMesh will automatically download and install new releases in the background.
          A weekly scheduled task handles the update — no action needed on your part.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Automatically install updates</span>
          <button
            type="button"
            role="switch"
            aria-checked={status.autoUpdateEnabled}
            onClick={toggleAutoUpdate}
            disabled={saving}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              status.autoUpdateEnabled ? 'bg-primary-500' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                status.autoUpdateEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
