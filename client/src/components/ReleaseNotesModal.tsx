import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { marked } from 'marked';
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
            <div
              className="text-sm text-text-primary [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-3 [&_h4]:font-medium [&_h4]:mb-1 [&_h4]:mt-2 [&_p]:mb-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2 [&_li]:mb-0.5 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-secondary [&_blockquote]:my-2 [&_code]:bg-surface-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-surface-tertiary [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:border-border [&_hr]:my-4 [&_a]:text-primary-400 [&_a]:underline [&_strong]:font-semibold [&_em]:italic"
              dangerouslySetInnerHTML={{ __html: marked.parse(status.releaseNotes, { async: false }) as string }}
            />
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
