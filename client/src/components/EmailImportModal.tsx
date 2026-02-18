import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, X, Search, RefreshCw } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { EmailQueueItem, EmailProvider } from '../types';

const CLASSIFICATION_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  task: { label: 'Task', bg: '#dbeafe', color: '#1d4ed8' },
  question: { label: 'Question', bg: '#fef3c7', color: '#92400e' },
  ignore: { label: 'Ignore', bg: '#f3f4f6', color: '#6b7280' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function EmailImportModal() {
  const { emailImportModal, closeEmailImportModal, currentBoard } = useBoardStore();
  const [queue, setQueue] = useState<EmailQueueItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<EmailProvider | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getEmailQueue();
      setQueue(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load email queue');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProviderTheme = useCallback(async () => {
    try {
      const outlook = await api.getEmailSettings('outlook');
      if (outlook?.active) {
        setProvider('outlook');
        return;
      }
      const gmail = await api.getEmailSettings('gmail');
      if (gmail?.active) {
        setProvider('gmail');
        return;
      }
    } catch {
      // ignore
    }
  }, []);

  // On open: fetch queue + provider settings
  useEffect(() => {
    if (emailImportModal) {
      setSelected(new Set());
      setImporting(false);
      setSearchQuery('');
      fetchQueue();
      fetchProviderTheme();
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [emailImportModal, fetchQueue, fetchProviderTheme]);

  // Auto-poll every 5s while open for classification updates
  useEffect(() => {
    if (!emailImportModal) return;

    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getEmailQueue();
        setQueue(data);
      } catch {
        // silent
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [emailImportModal]);

  // Escape key
  useEffect(() => {
    if (!emailImportModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEmailImportModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [emailImportModal, closeEmailImportModal]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshEmailQueue();
      await fetchQueue();
    } catch (err: any) {
      setError(err.message || 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!currentBoard || selected.size === 0) return;

    setImporting(true);
    setError(null);

    try {
      const { column, tasks } = await api.importEmails(
        currentBoard.id,
        Array.from(selected)
      );

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

      closeEmailImportModal();
    } catch (err: any) {
      setError(err.message || 'Failed to import emails');
    } finally {
      setImporting(false);
    }
  };

  if (!emailImportModal) return null;

  const isOutlook = provider === 'outlook';
  const accentColor = isOutlook ? '#0078d4' : '#ea4335';
  const accentBg = isOutlook ? 'rgba(0,120,212,0.08)' : 'rgba(234,67,53,0.08)';
  const accentLight = isOutlook ? 'rgba(0,120,212,0.2)' : 'rgba(234,67,53,0.2)';
  const providerLabel = isOutlook ? 'Outlook' : 'Gmail';

  const analyzingCount = queue.filter((e) => e.classification === null).length;

  const filteredQueue = searchQuery.trim()
    ? queue.filter(
        (e) =>
          e.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.from.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : queue;

  // Only show task and question items (not ignore) unless searching
  const displayQueue = searchQuery.trim()
    ? filteredQueue
    : filteredQueue.filter((e) => e.classification !== 'ignore');

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) closeEmailImportModal();
      }}
    >
      <div
        className="rounded-sm shadow-2xl w-full max-w-2xl overflow-hidden"
        style={{ fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' }}
      >
        {/* Top accent bar */}
        <div className="h-1" style={{ backgroundColor: accentColor }} />

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">{isOutlook ? '\u2709\uFE0F' : '\u2709\uFE0F'}</span>
            <h2 className="text-sm font-semibold" style={{ color: '#333' }}>
              Email Queue
            </h2>
            <span
              className="text-xs px-1.5 py-0.5 rounded-sm font-medium"
              style={{ backgroundColor: accentLight, color: accentColor }}
            >
              {providerLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-sm transition-colors hover:bg-gray-200 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} style={{ color: '#666' }} />
            </button>
            <button
              onClick={closeEmailImportModal}
              className="p-1 rounded-sm transition-colors"
              style={{ color: '#999' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#333')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#999')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Analyzing banner */}
        {analyzingCount > 0 && (
          <div
            className="flex items-center gap-2 px-5 py-2 text-sm"
            style={{ backgroundColor: '#fff7ed', color: '#9a3412', borderBottom: '1px solid #fed7aa' }}
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Analyzing {analyzingCount} email{analyzingCount !== 1 ? 's' : ''}...
          </div>
        )}

        {/* Search filter */}
        <div
          className="px-5 py-3"
          style={{ backgroundColor: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}
        >
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: '#999' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by subject or sender..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-sm focus:outline-none"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #d0d0d0',
                color: '#333',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = accentColor;
                e.currentTarget.style.boxShadow = `0 0 0 1px ${accentColor}`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d0d0d0';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
        </div>

        {/* Results list */}
        <div
          className="max-h-[400px] overflow-y-auto"
          style={{ backgroundColor: '#ffffff' }}
        >
          {loading && queue.length === 0 ? (
            <div className="flex items-center justify-center gap-2 text-sm py-12" style={{ color: '#999' }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: accentColor }} />
              Loading email queue...
            </div>
          ) : displayQueue.length === 0 && !loading ? (
            <div className="text-sm py-8 text-center" style={{ color: '#999' }}>
              No emails in queue
            </div>
          ) : (
            displayQueue.map((email, idx) => {
              const isSelected = selected.has(email.id);
              const badge = email.classification
                ? CLASSIFICATION_BADGES[email.classification]
                : null;

              return (
                <label
                  key={email.id}
                  className="flex items-center gap-0 cursor-pointer transition-colors"
                  style={{
                    borderBottom: idx < displayQueue.length - 1 ? '1px solid #f0f0f0' : undefined,
                    backgroundColor: isSelected ? accentBg : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#fafafa';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected ? accentBg : 'transparent';
                  }}
                >
                  {/* Classification color bar */}
                  <div
                    className="w-1 self-stretch shrink-0"
                    style={{
                      backgroundColor: badge?.color || '#d1d5db',
                    }}
                  />

                  {/* Checkbox */}
                  <div className="px-3 py-3 shrink-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(email.id)}
                      className="w-4 h-4 rounded-sm"
                      style={{ accentColor }}
                      disabled={email.classification === null}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 py-2.5 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Sender */}
                      <span className="text-xs font-semibold truncate" style={{ color: '#333', maxWidth: 180 }}>
                        {email.from.replace(/<[^>]+>/g, '').trim() || email.from}
                      </span>
                      {/* Classification badge */}
                      {email.classification === null ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Analyzing
                        </span>
                      ) : badge ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      ) : null}
                      {/* Timestamp */}
                      <span className="text-xs ml-auto shrink-0" style={{ color: '#999' }}>
                        {timeAgo(email.receivedAt)}
                      </span>
                    </div>
                    <div className="text-sm truncate" style={{ color: '#333' }}>
                      {email.subject}
                    </div>
                    <div className="text-xs truncate mt-0.5" style={{ color: '#999' }}>
                      {email.bodyText.substring(0, 120)}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-2 text-sm px-5 py-2.5"
            style={{ backgroundColor: '#fff0ee', color: '#d1352a', borderTop: '1px solid #fcc4bf' }}
          >
            <span className="shrink-0 mt-0.5 font-bold">!</span>
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#f8f8f8', borderTop: '1px solid #e0e0e0' }}
        >
          <div className="text-sm" style={{ color: '#666' }}>
            {selected.size > 0
              ? `${selected.size} email${selected.size !== 1 ? 's' : ''} selected`
              : 'Select emails to import as tasks'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={closeEmailImportModal}
              className="px-4 py-1.5 text-sm rounded-sm transition-colors"
              style={{
                color: '#333',
                backgroundColor: '#ffffff',
                border: '1px solid #d0d0d0',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="px-4 py-1.5 text-sm text-white rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              style={{ backgroundColor: accentColor }}
              onMouseEnter={(e) => {
                if (!importing && selected.size > 0) e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {importing && <Loader2 className="w-3 h-3 animate-spin" />}
              Import Emails
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
