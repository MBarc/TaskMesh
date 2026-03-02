import { useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { importConnector } from '../api/connectors';

interface ConnectorImportProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ConnectorImport({ onClose, onSuccess }: ConnectorImportProps) {
  const [manifestJson, setManifestJson] = useState('');
  const [handlerCode, setHandlerCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = manifestJson.trim().length > 0 && handlerCode.trim().length > 0;

  const handleImport = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await importConnector(manifestJson, handlerCode);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Check both files and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-lg shadow-xl border border-border w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Install Connector</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Paste the two files from the connector package. It will be available immediately.
            </p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-tertiary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-primary mb-1">
              manifest.json
            </label>
            <p className="text-xs text-text-muted mb-2">
              The connector's configuration — its name, ID, and what it can do.
            </p>
            <textarea
              value={manifestJson}
              onChange={(e) => { setManifestJson(e.target.value); setError(null); }}
              rows={8}
              placeholder={'{\n  "id": "my-connector",\n  "name": "My Connector",\n  "version": "1.0.0",\n  "capabilities": ["settings", "test-connection"],\n  ...\n}'}
              className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-primary mb-1">
              handlers.ts
            </label>
            <p className="text-xs text-text-muted mb-2">
              The connector's logic — how it connects, searches, and imports tasks.
            </p>
            <textarea
              value={handlerCode}
              onChange={(e) => { setHandlerCode(e.target.value); setError(null); }}
              rows={8}
              placeholder={'import type { ConnectorHandlers } from "../framework/types";\n\nexport const handlers: ConnectorHandlers = {\n  async testConnection(settings) {\n    // ...\n  },\n  // ...\n};'}
              className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded-md hover:bg-surface-tertiary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!canSubmit || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                Install Connector
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
