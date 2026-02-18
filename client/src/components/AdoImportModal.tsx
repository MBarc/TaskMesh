import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, X, Search } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { AdoWorkItemSearchResult } from '../types';

// ADO work item type colors (matching AdoPushModal)
const ADO_TYPE_COLORS: Record<string, string> = {
  'Epic': '#FF7B00',
  'Feature': '#773B93',
  'Product Backlog Item': '#009CCC',
  'User Story': '#009CCC',
  'Task': '#F2CB1D',
  'Bug': '#CC293D',
  'Issue': '#B4009E',
};

// ADO state badge colors
const ADO_STATE_COLORS: Record<string, { bg: string; text: string }> = {
  'New': { bg: '#e8f1fb', text: '#0078d4' },
  'Active': { bg: '#e8f4ea', text: '#107c10' },
  'In Progress': { bg: '#e8f4ea', text: '#107c10' },
  'Resolved': { bg: '#e8f1fb', text: '#0078d4' },
  'Committed': { bg: '#e8f4ea', text: '#107c10' },
  'Approved': { bg: '#e8f1fb', text: '#0078d4' },
};

export function AdoImportModal() {
  const { adoImportModal, closeAdoImportModal, currentBoard } = useBoardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<AdoWorkItemSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchWorkItems = useCallback(async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.searchAdoAssignedWorkItems(query);
      setResults(data);
    } catch (err: any) {
      setResults([]);
      setError(err.message || 'Failed to load work items');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load assigned work items when modal opens
  useEffect(() => {
    if (adoImportModal) {
      setSearchQuery('');
      setSelected(new Set());
      setImporting(false);
      fetchWorkItems();
    }
  }, [adoImportModal, fetchWorkItems]);

  useEffect(() => {
    if (!adoImportModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAdoImportModal();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [adoImportModal, closeAdoImportModal]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchWorkItems(value || undefined);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!currentBoard || selected.size === 0) return;

    setImporting(true);
    setError(null);

    const workItems = results.filter((r) => selected.has(r.id));

    try {
      const { column, itemNoColumn, tasks } = await api.importAdoWorkItems(currentBoard.id, workItems);

      const state = useBoardStore.getState();
      if (state.currentBoard) {
        let updatedColumns = state.currentBoard.columns;
        if (!updatedColumns.some((c) => c.id === column.id)) {
          updatedColumns = [...updatedColumns, column];
        }
        if (itemNoColumn && !updatedColumns.some((c) => c.id === itemNoColumn.id)) {
          updatedColumns = [...updatedColumns, itemNoColumn];
        }
        useBoardStore.setState({
          currentBoard: {
            ...state.currentBoard,
            columns: updatedColumns,
            tasks: [...state.currentBoard.tasks, ...tasks],
          },
        });
      }

      closeAdoImportModal();
    } catch (err: any) {
      setError(err.message || 'Failed to import work items');
    } finally {
      setImporting(false);
    }
  };

  if (!adoImportModal) return null;

  const getStateStyle = (state: string) => {
    return ADO_STATE_COLORS[state] || { bg: '#f3f2f1', text: '#323130' };
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) closeAdoImportModal();
      }}
    >
      <div
        className="rounded-sm shadow-2xl w-full max-w-2xl overflow-hidden"
        style={{ fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif' }}
      >
        {/* Blue top accent bar — ADO brand */}
        <div className="h-1" style={{ backgroundColor: '#0078d4' }} />

        {/* Header — ADO style */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#f8f8f8', borderBottom: '1px solid #c8c6c4' }}
        >
          <div className="flex items-center gap-2.5">
            {/* ADO logo mark */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
              <path d="M17 3.803v10.31l-5.06 3.887L7 15.562V18l-6-4.505 12.093-.857V4.857L17 3.803zM12.94 4L7 5.857v7.286l-5.938-.857V5.143L7 0l5.94 4z" fill="#0078d4"/>
            </svg>
            <h2 className="text-sm font-semibold" style={{ color: '#323130' }}>
              My Work Items
            </h2>
            <span
              className="text-xs px-1.5 py-0.5 rounded-sm"
              style={{ backgroundColor: 'rgba(0,120,212,0.1)', color: '#0078d4' }}
            >
              Azure DevOps
            </span>
          </div>
          <button
            onClick={closeAdoImportModal}
            className="p-1 rounded-sm transition-colors"
            style={{ color: '#605e5c' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#323130'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#605e5c'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search filter — ADO search bar style */}
        <div
          className="px-5 py-3"
          style={{ backgroundColor: '#faf9f8', borderBottom: '1px solid #edebe9' }}
        >
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: '#a19f9d' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Filter by work item title..."
              className="w-full pl-9 pr-9 py-2 text-sm rounded-sm focus:outline-none"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #c8c6c4',
                color: '#323130',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#0078d4';
                e.currentTarget.style.boxShadow = '0 0 0 1px #0078d4';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#c8c6c4';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {loading && (
              <Loader2
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
                style={{ color: '#0078d4' }}
              />
            )}
          </div>
        </div>

        {/* Results list — ADO list view style */}
        <div
          className="max-h-[400px] overflow-y-auto"
          style={{ backgroundColor: '#ffffff' }}
        >
          {loading && results.length === 0 ? (
            <div
              className="flex items-center justify-center gap-2 text-sm py-12"
              style={{ color: '#605e5c' }}
            >
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#0078d4' }} />
              Loading assigned work items...
            </div>
          ) : results.length === 0 && !loading ? (
            <div
              className="text-sm py-8 text-center"
              style={{ color: '#a19f9d' }}
            >
              No assigned work items found
            </div>
          ) : (
            results.map((wi, idx) => {
              const isSelected = selected.has(wi.id);
              const typeColor = ADO_TYPE_COLORS[wi.workItemType] || '#0078d4';
              const stateStyle = getStateStyle(wi.state);

              return (
                <label
                  key={wi.id}
                  className="flex items-center gap-0 cursor-pointer transition-colors"
                  style={{
                    borderBottom: idx < results.length - 1 ? '1px solid #edebe9' : undefined,
                    backgroundColor: isSelected ? 'rgba(0,120,212,0.06)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#f3f2f1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected ? 'rgba(0,120,212,0.06)' : 'transparent';
                  }}
                >
                  {/* Type color bar — ADO left indicator */}
                  <div
                    className="w-1 self-stretch shrink-0"
                    style={{ backgroundColor: typeColor }}
                  />

                  {/* Checkbox area */}
                  <div className="px-3 py-3 shrink-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(wi.id)}
                      className="w-4 h-4 rounded-sm"
                      style={{
                        accentColor: '#0078d4',
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 py-2.5 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Work item type badge */}
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium"
                        style={{ backgroundColor: typeColor + '18', color: typeColor, border: `1px solid ${typeColor}40` }}
                      >
                        {wi.workItemType}
                      </span>
                      {/* Work item ID — monospace */}
                      <span
                        className="text-xs"
                        style={{ color: '#605e5c', fontFamily: '"Consolas", "Courier New", monospace' }}
                      >
                        #{wi.id}
                      </span>
                      {/* State badge */}
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: stateStyle.bg, color: stateStyle.text }}
                      >
                        {wi.state}
                      </span>
                    </div>
                    <div
                      className="text-sm truncate"
                      style={{ color: '#323130' }}
                    >
                      {wi.title}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* Error — ADO-style error banner */}
        {error && (
          <div
            className="flex items-start gap-2 text-sm px-5 py-2.5"
            style={{ backgroundColor: '#fde7e9', color: '#a4262c', borderTop: '1px solid #f1bbbc' }}
          >
            <span className="shrink-0 mt-0.5 font-bold">!</span>
            <span>{error}</span>
          </div>
        )}

        {/* Footer — ADO action bar style */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#f8f8f8', borderTop: '1px solid #c8c6c4' }}
        >
          <div className="text-sm" style={{ color: '#605e5c' }}>
            {selected.size > 0
              ? `${selected.size} work item${selected.size !== 1 ? 's' : ''} selected`
              : 'Select work items to import'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={closeAdoImportModal}
              className="px-4 py-1.5 text-sm rounded-sm transition-colors"
              style={{
                color: '#323130',
                backgroundColor: '#ffffff',
                border: '1px solid #c8c6c4',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f2f1'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="px-4 py-1.5 text-sm text-white rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              style={{ backgroundColor: '#0078d4' }}
              onMouseEnter={(e) => {
                if (!importing && selected.size > 0) e.currentTarget.style.backgroundColor = '#106ebe';
              }}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0078d4'}
            >
              {importing && <Loader2 className="w-3 h-3 animate-spin" />}
              Import Work Items
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
