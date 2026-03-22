import { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, Copy, Check, ExternalLink, Loader2, ShieldCheck, ShieldOff, AlertTriangle } from 'lucide-react';
import * as api from '../api';
import type { LicenseInfo } from '../api';

function maskKey(key: string) {
  const parts = key.split('-');
  if (parts.length < 4) return key;
  return parts.slice(0, 2).join('-') + '-XXXX-XXXX-' + parts[parts.length - 1];
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function LicenseSettings() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getLicense()
      .then(setLicense)
      .catch(() => setLicense({ licenseKey: null, licenseTier: null, licenseExpiresAt: null, licenseActivatedAt: null }))
      .finally(() => setLoading(false));
  }, []);

  async function handleActivate() {
    if (!keyInput.trim()) return;
    setActivating(true);
    setError(null);
    try {
      const result = await api.activateLicense(keyInput.trim());
      setLicense(result);
      setKeyInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate license');
    } finally {
      setActivating(false);
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    setError(null);
    try {
      await api.deactivateLicense();
      setLicense({ licenseKey: null, licenseTier: null, licenseExpiresAt: null, licenseActivatedAt: null });
    } catch {
      setError('Failed to deactivate license');
    } finally {
      setDeactivating(false);
    }
  }

  async function copyKey() {
    if (!license?.licenseKey) return;
    await navigator.clipboard.writeText(license.licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <div className="bg-surface-secondary rounded-lg p-4 border border-border animate-pulse h-32" />;
  }

  const isActive = !!license?.licenseKey && !!license?.licenseTier;
  const expiresAt = license?.licenseExpiresAt;
  const daysLeft = expiresAt ? daysUntil(expiresAt) : null;
  const expiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft > 0;
  const expired = daysLeft !== null && daysLeft <= 0;
  const tierLabel = license?.licenseTier === 'PRO' ? 'Pro' : (license?.licenseTier ?? '');

  return (
    <div className="space-y-4">

      {/* ── Zone 1: Status ── */}
      <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">

        {/* Header row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className={`rounded-full p-1.5 ${isActive && !expired ? 'bg-green-100 text-green-600' : 'bg-surface-tertiary text-text-muted'}`}>
            {isActive && !expired ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-primary">
                {isActive && !expired ? `${tierLabel} License` : 'No active license'}
              </span>
              {isActive && !expired && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Active</span>
              )}
              {expired && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Expired</span>
              )}
            </div>
            {isActive && !expired && (
              <p className="text-xs text-green-600 font-medium mt-0.5">
                Awesome! Thank you for being a {tierLabel} user!
              </p>
            )}
          </div>
        </div>

        {/* Details rows */}
        {isActive && license?.licenseKey && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs text-text-muted mb-1.5 font-medium">License key</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-surface-primary px-3 py-1.5 font-mono text-xs text-text-secondary truncate">
                {showKey ? license.licenseKey : maskKey(license.licenseKey)}
              </code>
              <button onClick={() => setShowKey(v => !v)} title={showKey ? 'Hide' : 'Reveal'}
                className="rounded-md border border-border p-1.5 text-text-muted hover:text-text-secondary hover:bg-surface-tertiary transition-colors">
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button onClick={copyKey} title="Copy"
                className="rounded-md border border-border p-1.5 text-text-muted hover:text-text-secondary hover:bg-surface-tertiary transition-colors">
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Dates + features */}
        <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
          {expiresAt && (
            <div>
              <p className="text-xs text-text-muted font-medium mb-0.5">
                {expired ? 'Expired' : expiringSoon ? 'Expiring soon' : 'Renews'}
              </p>
              <p className={`text-xs ${expiringSoon ? 'text-amber-600 font-semibold' : expired ? 'text-red-500 font-semibold' : 'text-text-secondary'}`}>
                {expired
                  ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : expiringSoon
                    ? `${new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${daysLeft}d)`
                    : new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                }
              </p>
            </div>
          )}
          {license?.licenseActivatedAt && (
            <div>
              <p className="text-xs text-text-muted font-medium mb-0.5">Activated</p>
              <p className="text-xs text-text-secondary">
                {new Date(license.licenseActivatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}
          {isActive && !expired && (
            <div className="col-span-2">
              <p className="text-xs text-text-muted font-medium mb-1.5">Unlocked features</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {['3 machines', 'Unlimited boards', 'All connectors', 'Priority support'].map(f => (
                  <span key={f} className="flex items-center gap-1 text-xs text-text-secondary">
                    <Check className="h-3 w-3 text-green-500 shrink-0" />{f}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!isActive && (
            <div className="col-span-2">
              <p className="text-xs text-text-muted">
                You're on the Free plan. Enter a Pro license key to unlock more boards, all connectors, and more.{' '}
                <a href="https://taskmesh.co/pricing" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary-500 hover:underline">
                  See what you get with Pro <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Expiry/expired banners */}
        {(expiringSoon || expired) && (
          <div className={`px-4 py-2.5 flex items-start gap-2 border-t ${expired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${expired ? 'text-red-500' : 'text-amber-500'}`} />
            <p className={`text-xs ${expired ? 'text-red-700' : 'text-amber-700'}`}>
              {expired
                ? <>License expired. Pro features are disabled. <a href="https://taskmesh.co/settings/billing" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">Renew your plan</a> and enter the new key below.</>
                : <>Your license expires in {daysLeft} day{daysLeft === 1 ? '' : 's'}. <a href="https://taskmesh.co/settings/billing" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">Renew at taskmesh.co</a></>
              }
            </p>
          </div>
        )}
      </div>

      {/* ── Zone 2: Actions ── */}
      <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-text-primary">
            {isActive ? 'Replace license key' : 'Activate a license key'}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Find your key at{' '}
            <a href="https://taskmesh.co/settings/billing" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary-500 hover:underline">
              taskmesh.co/settings/billing <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={keyInput}
                onChange={e => { setKeyInput(e.target.value); setError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleActivate()}
                placeholder="TM-XXXX-XXXX-XXXX-XXXX"
                className="w-full rounded-md border border-border bg-surface-primary pl-9 pr-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
                spellCheck={false}
              />
            </div>
            <button
              onClick={handleActivate}
              disabled={activating || !keyInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {activating && <Loader2 className="h-3 w-3 animate-spin" />}
              Activate
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-500 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{error}
            </p>
          )}
        </div>

        {isActive && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <p className="text-xs text-text-muted">Remove the license from this installation.</p>
            <button
              onClick={handleDeactivate}
              disabled={deactivating}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-red-500 hover:bg-surface-tertiary disabled:opacity-50 transition-colors"
            >
              {deactivating && <Loader2 className="h-3 w-3 animate-spin" />}
              Deactivate
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
