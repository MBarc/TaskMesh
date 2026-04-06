import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, RefreshCw, Download, Clock, Calendar } from 'lucide-react';
import * as api from '../api';

type ApplyState = 'idle' | 'applying' | 'waiting' | 'done';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

function formatScheduledTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function UpdateSettings() {
  const [status, setStatus] = useState<api.UpdateStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState>('idle');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [serverDown, setServerDown] = useState(false);
  const [error, setError] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleDay, setScheduleDay] = useState(0);
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getUpdateStatus()
      .then(s => {
        setStatus(s);
        setScheduleDay(s.scheduleDay ?? 0);
        setScheduleHour(s.scheduleHour ?? 9);
      })
      .catch(() => setError(true));
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

  async function handleApplyNow() {
    setApplyError(null);
    setApplyState('applying');
    setProgress(0);
    setServerDown(false);
    try {
      await api.applyUpdate();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Update failed');
      setApplyState('idle');
      setProgress(0);
      return;
    }

    setApplyState('waiting');
    let serverWentDown = false;
    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts++;
      // Asymptotic progress toward 99% — slows naturally, never freezes
      setProgress(prev => Math.min(99, prev + Math.max(0.1, (99 - prev) * 0.03)));

      try {
        const res = await fetch('/health');
        if (res.ok && serverWentDown) {
          clearInterval(pollRef.current!);
          setProgress(100);
          setApplyState('done');
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch {
        if (!serverWentDown) {
          serverWentDown = true;
          setServerDown(true);
          setProgress(prev => Math.max(prev, 50));
        }
        if (attempts > 450) {
          clearInterval(pollRef.current!);
          setApplyError('Server did not restart in time. Please refresh the page manually.');
          setApplyState('idle');
          setProgress(0);
          setServerDown(false);
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

  async function saveSchedule() {
    setScheduleSaving(true);
    setScheduleSaved(false);
    try {
      const result = await api.updateSchedule(scheduleDay, scheduleHour);
      setStatus(prev => prev ? {
        ...prev,
        scheduleDay,
        scheduleHour,
        scheduledApplyAt: result.scheduledApplyAt,
      } : prev);
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2000);
    } finally {
      setScheduleSaving(false);
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

  const scheduleChanged = scheduleDay !== (status.scheduleDay ?? 0) || scheduleHour !== (status.scheduleHour ?? 9);

  return (
    <div className="space-y-4">
      {/* Applying overlay card */}
      {isApplying && (
        <div className={`border rounded-lg p-4 space-y-3 ${
          serverDown
            ? 'bg-amber-500/10 border-amber-500/40'
            : 'bg-primary-500/10 border-primary-500/30'
        }`}>
          <div className="flex items-start gap-3">
            <RefreshCw className={`w-4 h-4 shrink-0 mt-0.5 animate-spin ${serverDown ? 'text-amber-500' : 'text-primary-500'}`} />
            <div>
              <p className="text-sm font-medium text-text-primary">
                {applyState === 'applying' && 'Starting update…'}
                {applyState === 'waiting' && !serverDown && 'Downloading update…'}
                {applyState === 'waiting' && serverDown && 'Connection interrupted — this is expected'}
                {applyState === 'done' && 'Restarting…'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {applyState === 'applying' && 'Contacting update server.'}
                {applyState === 'waiting' && !serverDown && 'Downloading the installer from GitHub — this can take a few minutes depending on your connection. Keep this tab open.'}
                {applyState === 'waiting' && serverDown && 'The installer is running and TaskMesh is restarting. Your browser may show "Unable to connect" — ignore it and do not close this tab. The page will reload automatically.'}
                {applyState === 'done' && 'Almost there…'}
              </p>
            </div>
          </div>
          <div className={`w-full rounded-full h-1.5 overflow-hidden ${serverDown ? 'bg-amber-500/20' : 'bg-primary-500/20'}`}>
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${serverDown ? 'bg-amber-500' : 'bg-primary-500'}`}
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
          <p className="text-xs text-text-muted text-right">{Math.round(progress)}%</p>
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

        {/* Staged / ready-to-apply status */}
        {status.stagedVersion && (
          <div className="flex items-center gap-2 text-sm pt-1 pb-0.5">
            <Download className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span className="text-green-500">v{status.stagedVersion} downloaded and ready to apply</span>
          </div>
        )}

        {/* Scheduled apply time */}
        {status.scheduledApplyAt && status.stagedVersion && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Clock className="w-3 h-3 shrink-0" />
            <span>Scheduled to apply {formatScheduledTime(status.scheduledApplyAt)}</span>
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

          {(status.stagedVersion || status.updateAvailable) && !isApplying && (
            <button
              type="button"
              onClick={handleApplyNow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-md transition-colors"
            >
              <Download className="w-3 h-3" />
              {status.stagedVersion ? 'Apply now' : 'Download & apply'}
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
          When enabled, TaskMesh will silently download new releases in the background and apply them at your scheduled time.
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

      {/* Update schedule */}
      <div className="bg-surface-secondary rounded-lg p-4 border border-border space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-text-muted" />
          <h3 className="text-sm font-medium text-text-primary">Update Schedule</h3>
        </div>

        {status.autoUpdateEnabled ? (
          <>
            <p className="text-xs text-text-muted">
              Choose when TaskMesh should automatically apply downloaded updates. You'll get a 5-minute heads-up before the restart.
            </p>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-text-muted block mb-1">Day</label>
                <select
                  value={scheduleDay}
                  onChange={e => setScheduleDay(Number(e.target.value))}
                  className="w-full text-sm bg-surface border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-text-muted block mb-1">Time</label>
                <select
                  value={scheduleHour}
                  onChange={e => setScheduleHour(Number(e.target.value))}
                  className="w-full text-sm bg-surface border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour(i)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                <button
                  type="button"
                  onClick={saveSchedule}
                  disabled={scheduleSaving || !scheduleChanged}
                  className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded-md transition-colors"
                >
                  {scheduleSaving ? 'Saving…' : scheduleSaved ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>

            {status.scheduledApplyAt && status.stagedVersion && (
              <p className="text-xs text-text-muted flex items-center gap-1.5">
                <Clock className="w-3 h-3 shrink-0" />
                Next update: {formatScheduledTime(status.scheduledApplyAt)}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-text-muted">
            Enable automatic updates above to configure your preferred day and time.
          </p>
        )}
      </div>
    </div>
  );
}
