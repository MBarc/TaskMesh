import { useState, useEffect } from 'react';
import { X, Copy, Check, Loader2 } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';

export function DocViewerModal() {
  const { docViewerModal, closeDocViewerModal } = useBoardStore();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!docViewerModal) {
      setContent(null);
      setError(null);
      return;
    }

    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.readDocument(docViewerModal.filePath);
        setContent(result.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [docViewerModal]);

  if (!docViewerModal) return null;

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(docViewerModal.filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold text-text-primary truncate">
              {docViewerModal.fileName}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyPath}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded transition-colors"
              title="Copy file path"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Path'}
            </button>
            <button
              onClick={closeDocViewerModal}
              className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-surface-tertiary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              <span className="ml-2 text-text-secondary">Loading document...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">
              <p className="font-medium">Error loading document</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {content !== null && !loading && !error && (
            <pre className="whitespace-pre-wrap font-mono text-sm text-text-primary bg-surface-secondary p-4 rounded-lg border border-border overflow-auto">
              {content}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-text-muted truncate max-w-[70%]" title={docViewerModal.filePath}>
            {docViewerModal.filePath}
          </span>
          <button
            onClick={closeDocViewerModal}
            className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
