import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import * as api from '../api';

const STORAGE_KEY = 'seen_release_notes';

export function ReleaseNotesModal() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<api.UpdateStatus | null>(null);

  useEffect(() => {
    api.getUpdateStatus().then(s => {
      if (s.justUpdated && s.currentVersion) {
        const seen = localStorage.getItem(STORAGE_KEY);
        if (seen !== s.currentVersion) {
          setStatus(s);
          setVisible(true);
        }
      }
    }).catch(() => {});
  }, []);

  function dismiss() {
    if (status) {
      localStorage.setItem(STORAGE_KEY, status.currentVersion);
    }
    setVisible(false);
  }

  if (!visible || !status) return null;

  const formattedDate = status.releaseDate
    ? new Date(status.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              TaskMesh was updated to v{status.currentVersion}
            </h2>
            {formattedDate && (
              <p className="text-xs text-text-muted mt-0.5">{formattedDate}</p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-text-muted hover:text-text-primary transition-colors ml-4 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {status.releaseNotes ? (
            <div className="space-y-1">
              {status.releaseNotes.split('\n').map((line, i) => (
                <p key={i} className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              No release notes available for this version.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-border shrink-0">
          <a
            href="https://github.com/MBarc/TaskMesh/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-500 hover:underline"
          >
            See full changelog
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
