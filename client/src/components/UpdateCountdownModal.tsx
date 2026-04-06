import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Clock } from 'lucide-react';
import * as api from '../api';

interface Props {
  onNavigateToUpdates: () => void;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function UpdateCountdownModal({ onNavigateToUpdates }: Props) {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<api.UpdateStatus | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [acting, setActing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll update status every 30 seconds to detect warning window
  useEffect(() => {
    async function poll() {
      try {
        const s = await api.getUpdateStatus();
        setStatus(s);
        if (s.warningActive) {
          setVisible(true);
        }
      } catch {
        // Silent — don't disrupt the user if the poll fails
      }
    }

    poll();
    pollRef.current = setInterval(poll, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Live countdown tick
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!visible || !status?.scheduledApplyAt) return;

    function tick() {
      const remaining = new Date(status!.scheduledApplyAt!).getTime() - Date.now();
      setTimeRemaining(remaining);
    }
    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [visible, status?.scheduledApplyAt]);

  async function handleAcknowledge() {
    setActing(true);
    try {
      await api.acknowledgeUpdate();
    } catch {
      // Non-critical
    }
    setActing(false);
    setVisible(false);
  }

  async function handleDelay() {
    setActing(true);
    try {
      const result = await api.delayUpdate();
      setStatus(prev => prev ? { ...prev, scheduledApplyAt: result.scheduledApplyAt, delayUsed: true, warningActive: false } : prev);
    } catch {
      // Non-critical
    }
    setActing(false);
    setVisible(false);
  }

  function handleGoToSettings() {
    setVisible(false);
    onNavigateToUpdates();
  }

  if (!visible || !status) return null;

  const isImminent = timeRemaining !== null && timeRemaining <= 60000;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface rounded-xl shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-primary-500/10 border-b border-primary-500/20">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary-500/20 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-primary-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-text-primary">TaskMesh is about to update</p>
            <p className="text-xs text-text-muted mt-0.5">
              Version {status.stagedVersion ?? status.latestVersion} is ready to install
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Your scheduled update will apply shortly. TaskMesh will restart briefly — it only takes a moment.
          </p>

          {/* Countdown */}
          {status.scheduledApplyAt && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 ${
              isImminent ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-surface-secondary border border-border'
            }`}>
              <Clock className={`w-4 h-4 shrink-0 ${isImminent ? 'text-amber-500' : 'text-text-muted'}`} />
              <div>
                <p className={`text-xs font-medium ${isImminent ? 'text-amber-500' : 'text-text-muted'}`}>
                  Time remaining
                </p>
                <p className={`text-lg font-mono font-semibold leading-none mt-0.5 ${
                  isImminent ? 'text-amber-500' : 'text-text-primary'
                }`}>
                  {timeRemaining !== null ? formatTimeRemaining(timeRemaining) : '—'}
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-text-muted">
            If you don't respond, the update will proceed as scheduled.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-border bg-surface-secondary">
          {/* Delay — only if not already used */}
          {!status.delayUsed && (
            <button
              type="button"
              onClick={handleDelay}
              disabled={acting}
              className="flex-1 px-3 py-2 text-sm font-medium border border-border text-text-secondary hover:text-text-primary hover:border-primary-500/50 rounded-lg transition-colors disabled:opacity-50"
            >
              Delay 1 hour
            </button>
          )}

          <button
            type="button"
            onClick={handleGoToSettings}
            disabled={acting}
            className="px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
          >
            View update
          </button>

          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={acting}
            className={`px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50 ${
              status.delayUsed ? 'flex-1' : ''
            }`}
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}
