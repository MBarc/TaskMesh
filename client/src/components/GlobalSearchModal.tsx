import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Search, Calendar, Layers, Zap, Clock } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import { searchTasks } from '../api';
import type { SearchTaskResult } from '../api';

interface Props {
  onClose: () => void;
  onNavigate: (boardId: string, taskId: string) => void;
}

const SOURCES = [
  { value: 'ado',   label: 'Azure DevOps' },
  { value: 'snow',  label: 'ServiceNow' },
  { value: 'email', label: 'Email' },
];

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)   return 'just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getTaskTitle(cellValues: SearchTaskResult['cellValues']): string {
  const text = cellValues.find((cv) => cv.column.type === 'TEXT');
  return text?.value?.trim() || 'Untitled';
}

function getStatusLabel(cellValues: SearchTaskResult['cellValues']): string | undefined {
  const dropdown = cellValues.find((cv) => cv.column.type === 'DROPDOWN');
  return dropdown?.value?.trim() || undefined;
}

export function GlobalSearchModal({ onClose, onNavigate }: Props) {
  const { boards } = useBoardStore();

  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState<SearchTaskResult[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [offset,      setOffset]      = useState(0);
  const [filterBoard, setFilterBoard] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo,   setFilterDateTo]   = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const inputRef   = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const doSearch = useCallback(async (q: string, off: number) => {
    setLoading(true);
    try {
      const res = await searchTasks({
        q:         q || undefined,
        boardId:   filterBoard  || undefined,
        source:    filterSource || undefined,
        dateFrom:  filterDateFrom || undefined,
        dateTo:    filterDateTo   || undefined,
        limit: 20,
        offset: off,
      });
      setResults(off === 0 ? res.tasks : (prev) => [...prev, ...res.tasks]);
      setTotal(res.total);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [filterBoard, filterSource, filterDateFrom, filterDateTo]);

  // Debounce on query / filter changes
  useEffect(() => {
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, 0), 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filterBoard, filterSource, filterDateFrom, filterDateTo, doSearch]);

  // Group results by board
  const grouped = useMemo(() => {
    const map = new Map<string, { boardName: string; tasks: SearchTaskResult[] }>();
    for (const t of results) {
      if (!map.has(t.boardId)) map.set(t.boardId, { boardName: t.board.name, tasks: [] });
      map.get(t.boardId)!.tasks.push(t);
    }
    return Array.from(map.values());
  }, [results]);

  function handleResultClick(task: SearchTaskResult) {
    onNavigate(task.boardId, task.id);
  }

  function handleShowMore() {
    const newOffset = offset + 20;
    setOffset(newOffset);
    doSearch(query, newOffset);
  }

  const hasFilters = filterBoard || filterSource || filterDateFrom || filterDateTo;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-[15vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] ring-1 ring-border w-full max-w-2xl flex flex-col max-h-[70vh]">

        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, boards, values…"
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted text-base outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          <button
            onClick={() => setShowFilters((f) => !f)}
            className={`p-1.5 rounded transition-colors ${showFilters || hasFilters ? 'text-primary-500 bg-primary-500/10' : 'text-text-muted hover:text-text-primary hover:bg-surface-tertiary'}`}
            title="Toggle filters"
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-tertiary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters bar */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-secondary">
            {/* Board filter */}
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-text-muted" />
              <select
                value={filterBoard}
                onChange={(e) => setFilterBoard(e.target.value)}
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">All boards</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Source filter */}
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-text-muted" />
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Any source</option>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
                title="Updated from"
              />
              <span className="text-xs text-text-muted">–</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="text-xs bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-primary-500"
                title="Updated to"
              />
            </div>

            {hasFilters && (
              <button
                onClick={() => {
                  setFilterBoard('');
                  setFilterSource('');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                }}
                className="text-xs text-primary-500 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {!loading && results.length === 0 && (
            <div className="px-6 py-12 text-center">
              {query || hasFilters ? (
                <>
                  <p className="text-sm text-text-secondary">
                    Buzz couldn't find anything matching <span className="font-medium text-text-primary">"{query || 'your filters'}"</span>.
                  </p>
                  <p className="text-xs text-text-muted mt-1">Try different keywords or check another board.</p>
                </>
              ) : (
                <p className="text-sm text-text-muted">No recent tasks found.</p>
              )}
            </div>
          )}

          {!query && !hasFilters && results.length > 0 && (
            <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-xs text-text-muted font-medium">
              <Clock className="w-3.5 h-3.5" />
              Recently updated
            </div>
          )}

          {grouped.map(({ boardName, tasks }) => (
            <div key={boardName}>
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted bg-surface-secondary border-b border-border sticky top-0">
                {boardName}
              </div>
              {tasks.map((task) => {
                const title  = getTaskTitle(task.cellValues);
                const status = getStatusLabel(task.cellValues);
                return (
                  <button
                    key={task.id}
                    onClick={() => handleResultClick(task)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-tertiary transition-colors border-b border-border/50 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate group-hover:text-primary-500 transition-colors">
                        {title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {status && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-tertiary text-text-secondary border border-border">
                            {status}
                          </span>
                        )}
                        <span className="text-xs text-text-muted">{formatRelative(task.updatedAt)}</span>
                      </div>
                    </div>
                    <Search className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                  </button>
                );
              })}
            </div>
          ))}

          {/* Show more */}
          {results.length > 0 && results.length < total && (
            <div className="px-4 py-3 text-center border-t border-border">
              <button
                onClick={handleShowMore}
                disabled={loading}
                className="text-sm text-primary-500 hover:underline disabled:opacity-50"
              >
                Show more ({total - results.length} remaining)
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-text-muted">
          <span>
            Press{' '}
            <kbd className="px-1.5 py-0.5 font-mono bg-surface-tertiary border border-border rounded">Esc</kbd>
            {' '}to close
          </span>
          {results.length > 0 && (
            <span>{total} result{total !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  );
}
