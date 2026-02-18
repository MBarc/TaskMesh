import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, X, Search } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { SnowIncidentSearchResult } from '../types';

// ServiceNow priority indicator colors (left bar style)
const PRIORITY_COLORS: Record<string, string> = {
  '1 - Critical': '#ff402c',
  '2 - High': '#ff8c00',
  '3 - Moderate': '#ffd042',
  '4 - Low': '#56b53e',
  '5 - Planning': '#bfbfbf',
};

// ServiceNow state badge colors
const STATE_COLORS: Record<string, { bg: string; text: string }> = {
  'New': { bg: '#e0ecf9', text: '#1a6dd8' },
  'In Progress': { bg: '#e0f2e0', text: '#2b8634' },
  'On Hold': { bg: '#fff4d6', text: '#8a6914' },
  'Resolved': { bg: '#d9f0f0', text: '#1a7a7a' },
  'Closed': { bg: '#e8e8e8', text: '#6c6c6c' },
};

export function SnowImportModal() {
  const { snowImportModal, closeSnowImportModal, currentBoard } = useBoardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SnowIncidentSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [notConfigured, setNotConfigured] = useState(false);

  const fetchIncidents = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      const data = await api.searchSnowIncidents(query);
      setResults(data);
    } catch (err: any) {
      setResults([]);
      const msg = err.message || 'Failed to load incidents';
      if (msg.toLowerCase().includes('not configured')) {
        setNotConfigured(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load open work when modal opens
  useEffect(() => {
    if (snowImportModal) {
      setSearchQuery('');
      setSelected(new Set());
      setImporting(false);
      fetchIncidents();
    }
  }, [snowImportModal, fetchIncidents]);

  useEffect(() => {
    if (!snowImportModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSnowImportModal();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [snowImportModal, closeSnowImportModal]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchIncidents(value || undefined);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const toggleSelect = (sysId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sysId)) {
        next.delete(sysId);
      } else {
        next.add(sysId);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!currentBoard || selected.size === 0) return;

    setImporting(true);
    setError(null);

    const incidents = results.filter((r) => selected.has(r.sysId));

    try {
      const { column, tasks } = await api.importSnowIncidents(currentBoard.id, incidents);

      const state = useBoardStore.getState();
      if (state.currentBoard) {
        const hasColumn = state.currentBoard.columns.some((c) => c.id === column.id);
        useBoardStore.setState({
          currentBoard: {
            ...state.currentBoard,
            columns: hasColumn
              ? state.currentBoard.columns
              : [...state.currentBoard.columns, column],
            tasks: [...state.currentBoard.tasks, ...tasks],
          },
        });
      }

      closeSnowImportModal();
    } catch (err: any) {
      setError(err.message || 'Failed to import incidents');
    } finally {
      setImporting(false);
    }
  };

  if (!snowImportModal) return null;

  const getStateStyle = (state: string) => {
    return STATE_COLORS[state] || { bg: '#e8e8e8', text: '#6c6c6c' };
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) closeSnowImportModal();
      }}
    >
      <div
        className="rounded-sm shadow-2xl w-full max-w-2xl overflow-hidden"
        style={{ fontFamily: '"Source Sans Pro", "Helvetica Neue", Arial, sans-serif' }}
      >
        {/* Green top accent bar — ServiceNow brand */}
        <div className="h-1" style={{ backgroundColor: '#81b532' }} />

        {/* Header — ServiceNow dark header style */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#293e40', borderBottom: '1px solid #1e2e30' }}
        >
          <div className="flex items-center gap-2.5">
            {/* ServiceNow logo mark */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 17.5c-4.14 0-7.5-3.36-7.5-7.5S7.86 4.5 12 4.5s7.5 3.36 7.5 7.5-3.36 7.5-7.5 7.5z"
                fill="#81b532"
              />
              <path
                d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 7.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 9.5 12 9.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                fill="#81b532"
              />
            </svg>
            <h2 className="text-sm font-semibold" style={{ color: '#ffffff' }}>
              My Work
            </h2>
            <span
              className="text-xs px-1.5 py-0.5 rounded-sm"
              style={{ backgroundColor: 'rgba(129,181,50,0.2)', color: '#a5d353' }}
            >
              ServiceNow
            </span>
          </div>
          <button
            onClick={closeSnowImportModal}
            className="p-1 rounded-sm transition-colors"
            style={{ color: '#98a6a8' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#98a6a8'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search filter — ServiceNow search bar style */}
        <div
          className="px-5 py-3"
          style={{ backgroundColor: '#f1f1f1', borderBottom: '1px solid #d9d9d9' }}
        >
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: '#999999' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Filter by description or incident number..."
              disabled={notConfigured}
              className="w-full pl-9 pr-9 py-2 text-sm rounded-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #bfbfbf',
                color: '#292929',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#81b532';
                e.currentTarget.style.boxShadow = '0 0 0 1px #81b532';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#bfbfbf';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {loading && (
              <Loader2
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
                style={{ color: '#81b532' }}
              />
            )}
          </div>
        </div>

        {/* Results list — ServiceNow list view style */}
        <div
          className="max-h-[400px] overflow-y-auto"
          style={{ backgroundColor: '#ffffff' }}
        >
          {notConfigured ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mb-3 opacity-40">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 17.5c-4.14 0-7.5-3.36-7.5-7.5S7.86 4.5 12 4.5s7.5 3.36 7.5 7.5-3.36 7.5-7.5 7.5z"
                  fill="#999999"
                />
                <path
                  d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 7.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 9.5 12 9.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                  fill="#999999"
                />
              </svg>
              <div className="text-sm font-semibold mb-1" style={{ color: '#292929' }}>
                ServiceNow connector not configured
              </div>
              <div className="text-xs" style={{ color: '#999999' }}>
                Set up your ServiceNow instance URL, API key, and Assigned To in Settings to import incidents.
              </div>
            </div>
          ) : loading && results.length === 0 ? (
            <div
              className="flex items-center justify-center gap-2 text-sm py-12"
              style={{ color: '#6c6c6c' }}
            >
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#81b532' }} />
              Loading open incidents...
            </div>
          ) : results.length === 0 && !loading ? (
            <div
              className="text-sm py-8 text-center"
              style={{ color: '#999999' }}
            >
              No open incidents found
            </div>
          ) : (
            results.map((incident, idx) => {
              const isSelected = selected.has(incident.sysId);
              const priorityColor = PRIORITY_COLORS[incident.priority] || '#bfbfbf';
              const stateStyle = getStateStyle(incident.state);

              return (
                <label
                  key={incident.sysId}
                  className="flex items-center gap-0 cursor-pointer transition-colors"
                  style={{
                    borderBottom: idx < results.length - 1 ? '1px solid #e8e8e8' : undefined,
                    backgroundColor: isSelected ? 'rgba(129,181,50,0.08)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected ? 'rgba(129,181,50,0.08)' : 'transparent';
                  }}
                >
                  {/* Priority color bar — ServiceNow left indicator */}
                  <div
                    className="w-1 self-stretch shrink-0"
                    style={{ backgroundColor: priorityColor }}
                  />

                  {/* Checkbox area */}
                  <div className="px-3 py-3 shrink-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(incident.sysId)}
                      className="w-4 h-4 rounded-sm"
                      style={{
                        accentColor: '#81b532',
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 py-2.5 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Ticket number — ServiceNow link style */}
                      <span
                        className="text-xs font-semibold"
                        style={{ color: '#1a6dd8' }}
                      >
                        {incident.number}
                      </span>
                      {/* State badge — ServiceNow pill */}
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: stateStyle.bg, color: stateStyle.text }}
                      >
                        {incident.state}
                      </span>
                      {/* Priority — small label */}
                      <span
                        className="text-xs"
                        style={{ color: '#6c6c6c' }}
                      >
                        {incident.priority}
                      </span>
                    </div>
                    <div
                      className="text-sm truncate"
                      style={{ color: '#292929' }}
                    >
                      {incident.shortDescription}
                    </div>
                    {incident.assignedTo && (
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: '#999999' }}
                      >
                        {incident.assignedTo}
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* Error — ServiceNow-style error banner */}
        {error && (
          <div
            className="flex items-start gap-2 text-sm px-5 py-2.5"
            style={{ backgroundColor: '#fff0ee', color: '#d1352a', borderTop: '1px solid #fcc4bf' }}
          >
            <span className="shrink-0 mt-0.5 font-bold">!</span>
            <span>{error}</span>
          </div>
        )}

        {/* Footer — ServiceNow action bar style */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#f1f1f1', borderTop: '1px solid #d9d9d9' }}
        >
          <div className="text-sm" style={{ color: '#6c6c6c' }}>
            {selected.size > 0
              ? `${selected.size} incident${selected.size !== 1 ? 's' : ''} selected`
              : 'Select incidents to import'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={closeSnowImportModal}
              className="px-4 py-1.5 text-sm rounded-sm transition-colors"
              style={{
                color: '#292929',
                backgroundColor: '#ffffff',
                border: '1px solid #bfbfbf',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e8e8e8'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="px-4 py-1.5 text-sm text-white rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              style={{ backgroundColor: '#81b532' }}
              onMouseEnter={(e) => {
                if (!importing && selected.size > 0) e.currentTarget.style.backgroundColor = '#6d9a2a';
              }}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#81b532'}
            >
              {importing && <Loader2 className="w-3 h-3 animate-spin" />}
              Import Incidents
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
