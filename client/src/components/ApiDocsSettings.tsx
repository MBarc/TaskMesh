import { ExternalLink, Download } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

export function ApiDocsSettings() {
  return (
    <div className="bg-surface-secondary rounded-lg p-4 border border-border space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-1">API Documentation</h3>
        <p className="text-xs text-text-secondary">
          TaskMesh exposes a REST API for managing boards, columns, tasks, and integrations.
          The interactive Swagger UI lets you explore all endpoints, try them out, and copy cURL commands.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={`${API_URL}/api/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded bg-primary-500 text-white hover:bg-primary-600 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open API Documentation
        </a>

        <a
          href={`${API_URL}/api/docs.json`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded border border-border text-text-primary hover:bg-surface-tertiary transition-colors"
        >
          <Download className="w-4 h-4" />
          Download OpenAPI Spec (JSON)
        </a>
      </div>

      <div className="text-xs text-text-secondary space-y-1">
        <p>To authenticate API requests, include your API key in the Authorization header:</p>
        <code className="block bg-surface rounded border border-border px-3 py-2 font-mono text-xs text-text-primary">
          Authorization: Bearer tm01.your-api-key-here
        </code>
      </div>
    </div>
  );
}
