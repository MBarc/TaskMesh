import { useState, useEffect, useCallback } from 'react';
import { Key, Copy, Check, Trash2, Eye, X, AlertTriangle, ChevronDown } from 'lucide-react';
import * as api from '../api';
import type { ApiKey, ApiKeyUsageEntry } from '../types';

const EXPIRATION_PRESETS = [
  { label: '1 Day', days: 1 },
  { label: '3 Days', days: 3 },
  { label: '1 Week', days: 7 },
  { label: '2 Weeks', days: 14 },
  { label: '1 Month', days: 30 },
  { label: '1 Year', days: 365 },
];

// All 13 scopes
const ALL_SCOPES = [
  'boards:read', 'boards:write',
  'tasks:read', 'tasks:write',
  'connectors:read', 'connectors:write', 'connectors:sync', 'connectors:push',
  'ai:extract', 'ai:transcribe', 'ai:reword',
  'apikeys:read', 'apikeys:write',
];

// Grouped for the custom checklist
const SCOPE_GROUPS: { label: string; scopes: { id: string; label: string }[] }[] = [
  {
    label: 'Boards & Tasks',
    scopes: [
      { id: 'boards:read', label: 'Read boards & columns' },
      { id: 'boards:write', label: 'Create/edit/delete boards & columns' },
      { id: 'tasks:read', label: 'Read tasks' },
      { id: 'tasks:write', label: 'Create/edit/delete tasks' },
    ],
  },
  {
    label: 'Connectors',
    scopes: [
      { id: 'connectors:read', label: 'View connector settings & status' },
      { id: 'connectors:write', label: 'Save connector settings & disconnect' },
      { id: 'connectors:sync', label: 'Search & import items' },
      { id: 'connectors:push', label: 'Push tasks to external systems' },
    ],
  },
  {
    label: 'AI',
    scopes: [
      { id: 'ai:extract', label: 'Extract tasks from notes / transcription jobs' },
      { id: 'ai:transcribe', label: 'Transcribe video/audio' },
      { id: 'ai:reword', label: 'Reword, generate sections & themes' },
    ],
  },
  {
    label: 'Admin',
    scopes: [
      { id: 'apikeys:read', label: 'List API keys & view history' },
      { id: 'apikeys:write', label: 'Create & revoke API keys' },
    ],
  },
];

type ScopePreset = 'full' | 'readonly' | 'automation' | 'developer' | 'custom';

const SCOPE_PRESETS: { id: ScopePreset; label: string; scopes: string[] | null }[] = [
  { id: 'full', label: 'Full access', scopes: null }, // null = empty array (full compat)
  { id: 'readonly', label: 'Read only', scopes: ['boards:read', 'tasks:read'] },
  { id: 'automation', label: 'Automation', scopes: ['tasks:read', 'tasks:write', 'connectors:sync'] },
  { id: 'developer', label: 'Developer', scopes: ALL_SCOPES.filter(s => s !== 'apikeys:write') },
  { id: 'custom', label: 'Custom', scopes: [] },
];

function buildScopeSummary(scopes: string[]): string {
  if (scopes.length === 0) return 'This key has full access to all endpoints.';
  const parts: string[] = [];
  if (scopes.includes('boards:read') || scopes.includes('boards:write')) {
    const actions = [];
    if (scopes.includes('boards:read')) actions.push('read');
    if (scopes.includes('boards:write')) actions.push('write');
    parts.push(`${actions.join('/')} boards`);
  }
  if (scopes.includes('tasks:read') || scopes.includes('tasks:write')) {
    const actions = [];
    if (scopes.includes('tasks:read')) actions.push('read');
    if (scopes.includes('tasks:write')) actions.push('write');
    parts.push(`${actions.join('/')} tasks`);
  }
  if (scopes.includes('connectors:read') || scopes.includes('connectors:write') || scopes.includes('connectors:sync') || scopes.includes('connectors:push')) {
    const actions = [];
    if (scopes.includes('connectors:read')) actions.push('view');
    if (scopes.includes('connectors:write')) actions.push('configure');
    if (scopes.includes('connectors:sync')) actions.push('sync');
    if (scopes.includes('connectors:push')) actions.push('push');
    parts.push(`${actions.join('/')} connectors`);
  }
  const aiScopes = [];
  if (scopes.includes('ai:extract')) aiScopes.push('extract');
  if (scopes.includes('ai:transcribe')) aiScopes.push('transcribe');
  if (scopes.includes('ai:reword')) aiScopes.push('reword');
  if (aiScopes.length > 0) parts.push(`AI: ${aiScopes.join(', ')}`);
  const adminScopes = [];
  if (scopes.includes('apikeys:read')) adminScopes.push('read');
  if (scopes.includes('apikeys:write')) adminScopes.push('manage');
  if (adminScopes.length > 0) parts.push(`${adminScopes.join('/')} API keys`);
  return parts.length > 0 ? `This key can: ${parts.join('; ')}.` : 'No permissions selected.';
}

export function ApiKeySettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customExpiry, setCustomExpiry] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Scope state
  const [scopePreset, setScopePreset] = useState<ScopePreset>('full');
  const [customScopes, setCustomScopes] = useState<string[]>([]);
  const [showCustomScopes, setShowCustomScopes] = useState(false);

  const [historyKeyId, setHistoryKeyId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ApiKeyUsageEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await api.getApiKeys();
      setKeys(data);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const getEffectiveScopes = (): string[] => {
    const preset = SCOPE_PRESETS.find(p => p.id === scopePreset);
    if (!preset) return [];
    if (scopePreset === 'full') return []; // empty = full access
    if (scopePreset === 'custom') return customScopes;
    return preset.scopes!;
  };

  const handlePresetClick = (id: ScopePreset) => {
    if (id === 'custom' && scopePreset === 'custom') {
      // Toggle the checklist when clicking Custom while it's already selected
      setShowCustomScopes(prev => !prev);
      return;
    }
    setScopePreset(id);
    setShowCustomScopes(id === 'custom');
    if (id === 'custom') {
      // Seed with currently selected preset's scopes
      const current = SCOPE_PRESETS.find(p => p.id === scopePreset);
      if (current && current.scopes !== null) {
        setCustomScopes(current.scopes);
      }
    }
  };

  const toggleCustomScope = (scope: string) => {
    setCustomScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const handleCreate = async () => {
    let expiresAt: string;
    if (selectedPreset !== null) {
      const d = new Date();
      d.setDate(d.getDate() + selectedPreset);
      expiresAt = d.toISOString();
    } else if (customExpiry) {
      expiresAt = new Date(customExpiry).toISOString();
    } else {
      return;
    }

    if (!name.trim()) return;

    const scopes = getEffectiveScopes();

    setCreating(true);
    try {
      const result = await api.createApiKey({ name: name.trim(), expiresAt, scopes });
      setNewKey(result.key);
      setName('');
      setSelectedPreset(null);
      setCustomExpiry('');
      setScopePreset('full');
      setCustomScopes([]);
      setShowCustomScopes(false);
      fetchKeys();
    } catch (err) {
      console.error('Failed to create API key:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.revokeApiKey(id);
      fetchKeys();
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openHistory = async (keyId: string) => {
    setHistoryKeyId(keyId);
    setHistoryPage(1);
    setHistoryLoading(true);
    try {
      const data = await api.getApiKeyHistory(keyId, 1);
      setHistoryEntries(data.entries);
      setHistoryTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadHistoryPage = async (page: number) => {
    if (!historyKeyId) return;
    setHistoryPage(page);
    setHistoryLoading(true);
    try {
      const data = await api.getApiKeyHistory(historyKeyId, page);
      setHistoryEntries(data.entries);
      setHistoryTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const hasExpiration = selectedPreset !== null || customExpiry;
  const effectiveScopes = getEffectiveScopes();
  const scopeSummary = buildScopeSummary(effectiveScopes);
  const historyKey = keys.find(k => k.id === historyKeyId);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      EXPIRED: 'bg-yellow-100 text-yellow-800',
      REVOKED: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const scopeBadge = (scopes: string[]) => {
    if (!scopes || scopes.length === 0) {
      return <span className="text-xs text-text-secondary">Full access</span>;
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-500/10 text-primary-500">
        {scopes.length} scope{scopes.length !== 1 ? 's' : ''}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Create Key Form */}
      <div className="bg-surface-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
          <Key className="w-4 h-4" />
          Generate API Key
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Key Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Script, Postman, CI/CD"
              className="w-full px-3 py-1.5 text-sm rounded border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Expiration</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {EXPIRATION_PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  onClick={() => { setSelectedPreset(preset.days); setCustomExpiry(''); }}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    selectedPreset === preset.days
                      ? 'border-primary-500 bg-primary-500/10 text-primary-500'
                      : 'border-border text-text-secondary hover:text-text-primary hover:border-border'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">or custom:</span>
              <input
                type="datetime-local"
                value={customExpiry}
                onChange={(e) => { setCustomExpiry(e.target.value); setSelectedPreset(null); }}
                className="px-2 py-1 text-xs rounded border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Scope Presets */}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Permissions</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {SCOPE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset.id)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors flex items-center gap-1 ${
                    scopePreset === preset.id
                      ? 'border-primary-500 bg-primary-500/10 text-primary-500'
                      : 'border-border text-text-secondary hover:text-text-primary hover:border-border'
                  }`}
                >
                  {preset.label}
                  {preset.id === 'custom' && <ChevronDown className={`w-3 h-3 transition-transform ${showCustomScopes ? 'rotate-180' : ''}`} />}
                </button>
              ))}
            </div>

            {/* Custom scope checklist */}
            {showCustomScopes && (
              <div className="border border-border rounded-lg overflow-hidden mb-2">
                {SCOPE_GROUPS.map((group, gi) => (
                  <div key={group.label} className={gi > 0 ? 'border-t border-border' : ''}>
                    <div className="px-3 py-1.5 bg-surface-tertiary">
                      <span className="text-xs font-medium text-text-secondary">{group.label}</span>
                    </div>
                    <div className="px-3 py-1.5 space-y-1">
                      {group.scopes.map((scope) => (
                        <label key={scope.id} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={customScopes.includes(scope.id)}
                            onChange={() => toggleCustomScope(scope.id)}
                            className="w-3.5 h-3.5 rounded border-border text-primary-500 accent-primary-500"
                          />
                          <span className="text-xs text-text-primary group-hover:text-text-primary">
                            {scope.label}
                            <span className="ml-1.5 text-text-secondary font-mono">{scope.id}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scope summary */}
            <p className="text-xs text-text-secondary italic">{scopeSummary}</p>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !name.trim() || !hasExpiration}
            className="px-4 py-1.5 text-sm font-medium rounded bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Generating...' : 'Generate Key'}
          </button>
        </div>
      </div>

      {/* One-time key reveal */}
      {newKey && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              Copy your API key now. It will not be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white rounded border border-amber-200 px-3 py-2">
            <code className="text-sm text-amber-900 flex-1 font-mono break-all">{newKey}</code>
            <button
              onClick={() => handleCopy(newKey)}
              className="shrink-0 p-1 rounded hover:bg-amber-100 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-amber-600" />}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-2 text-xs text-amber-700 hover:text-amber-900 underline"
          >
            I've copied it, dismiss
          </button>
        </div>
      )}

      {/* Keys Table */}
      <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">Your API Keys</h3>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-text-secondary text-sm">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="px-4 py-8 text-center text-text-secondary text-sm">No API keys created yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-tertiary">
                  <th className="text-left px-4 py-2 font-medium text-text-secondary">Name</th>
                  <th className="text-left px-4 py-2 font-medium text-text-secondary">Key</th>
                  <th className="text-left px-4 py-2 font-medium text-text-secondary">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-text-secondary">Permissions</th>
                  <th className="text-left px-4 py-2 font-medium text-text-secondary">Created</th>
                  <th className="text-left px-4 py-2 font-medium text-text-secondary">Expires</th>
                  <th className="text-left px-4 py-2 font-medium text-text-secondary">Usage</th>
                  <th className="text-right px-4 py-2 font-medium text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-border last:border-0 hover:bg-surface-tertiary/50">
                    <td className="px-4 py-2 text-text-primary font-medium">{k.name}</td>
                    <td className="px-4 py-2 text-text-secondary font-mono text-xs">{k.maskedKey}</td>
                    <td className="px-4 py-2">{statusBadge(k.status)}</td>
                    <td className="px-4 py-2">{scopeBadge(k.scopes)}</td>
                    <td className="px-4 py-2 text-text-secondary text-xs">{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-text-secondary text-xs">{new Date(k.expiresAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-text-secondary text-xs">{k.usageCount} requests</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openHistory(k.id)}
                          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-tertiary transition-colors"
                          title="View History"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {k.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleRevoke(k.id)}
                            className="p-1 rounded text-text-secondary hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Revoke Key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* History Modal */}
      {historyKeyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-lg shadow-xl border border-border w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-text-primary">
                Usage History ({historyTotal} total)
              </h3>
              <button
                onClick={() => setHistoryKeyId(null)}
                className="p-1 rounded hover:bg-surface-tertiary transition-colors"
              >
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>

            {/* Scopes summary in modal */}
            {historyKey && (
              <div className="px-4 py-2.5 border-b border-border bg-surface-secondary">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-text-secondary font-medium">Permissions:</span>
                  {!historyKey.scopes || historyKey.scopes.length === 0 ? (
                    <span className="text-xs text-text-secondary">Full access (all scopes)</span>
                  ) : (
                    historyKey.scopes.map(s => (
                      <span key={s} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-primary-500/10 text-primary-500">
                        {s}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              {historyLoading ? (
                <div className="px-4 py-8 text-center text-text-secondary text-sm">Loading...</div>
              ) : historyEntries.length === 0 ? (
                <div className="px-4 py-8 text-center text-text-secondary text-sm">No usage recorded yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-tertiary sticky top-0">
                      <th className="text-left px-4 py-2 font-medium text-text-secondary">Method</th>
                      <th className="text-left px-4 py-2 font-medium text-text-secondary">Path</th>
                      <th className="text-left px-4 py-2 font-medium text-text-secondary">Status</th>
                      <th className="text-left px-4 py-2 font-medium text-text-secondary">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyEntries.map((e) => (
                      <tr key={e.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium ${
                            e.method === 'GET' ? 'bg-blue-100 text-blue-800' :
                            e.method === 'POST' ? 'bg-green-100 text-green-800' :
                            e.method === 'PUT' ? 'bg-amber-100 text-amber-800' :
                            e.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {e.method}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-text-primary font-mono text-xs">{e.path}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-mono ${e.statusCode < 400 ? 'text-green-600' : 'text-red-600'}`}>
                            {e.statusCode}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-text-secondary text-xs">
                          {new Date(e.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {historyTotal > 50 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                <button
                  onClick={() => loadHistoryPage(historyPage - 1)}
                  disabled={historyPage <= 1}
                  className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-text-secondary">
                  Page {historyPage} of {Math.ceil(historyTotal / 50)}
                </span>
                <button
                  onClick={() => loadHistoryPage(historyPage + 1)}
                  disabled={historyPage >= Math.ceil(historyTotal / 50)}
                  className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
