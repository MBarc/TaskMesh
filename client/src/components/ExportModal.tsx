import { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import type { Board } from '../types';
import { exportBoard } from '../api';

interface ExportModalProps {
  scope: 'board' | 'selected';
  board: Board;
  selectedTaskIds?: Set<string>;
  onClose: () => void;
}

export function ExportModal({ scope, board, selectedTaskIds, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const taskCount = scope === 'selected' ? (selectedTaskIds?.size ?? 0) : board.tasks.length;

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      await exportBoard(
        board.id,
        format,
        scope === 'selected' ? [...(selectedTaskIds ?? [])] : undefined
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Export Tasks</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-tertiary transition-colors text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-text-secondary mb-5">
          {scope === 'selected' ? (
            <>Exporting <strong className="text-text-primary">{taskCount} selected {taskCount === 1 ? 'task' : 'tasks'}</strong></>
          ) : (
            <>Exporting <strong className="text-text-primary">all {taskCount} {taskCount === 1 ? 'task' : 'tasks'}</strong> from <em>"{board.name}"</em></>
          )}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-6">
          {(['csv', 'json'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`flex flex-col items-start p-3 rounded-lg border transition-colors text-left ${
                format === f
                  ? 'bg-surface-tertiary border-primary-500 text-text-primary'
                  : 'border-border text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              <span className="font-medium text-sm uppercase">{f}</span>
              <span className="text-xs mt-0.5 leading-snug">
                {f === 'csv'
                  ? 'Compatible with Excel, Google Sheets'
                  : 'Full structure, suitable for re-import'}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={handleDownload}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {loading ? 'Preparing…' : 'Download'}
        </button>

        {error && (
          <p className="text-sm text-red-500 mt-3">{error}</p>
        )}
      </div>
    </div>
  );
}
