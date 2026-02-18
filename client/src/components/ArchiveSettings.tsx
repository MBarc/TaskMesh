import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useArchiveStore } from '../stores/archiveStore';

export function ArchiveSettings() {
  const { settings, fetchSettings, updateSettings } = useArchiveStore();
  const [retentionDays, setRetentionDays] = useState('30');
  const [showDisableModal, setShowDisableModal] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setRetentionDays(String(settings.archiveRetentionDays));
    }
  }, [settings]);

  const handleToggle = () => {
    if (settings?.archiveEnabled) {
      // Disabling — show warning modal
      setShowDisableModal(true);
    } else {
      // Enabling
      updateSettings({ archiveEnabled: true });
    }
  };

  const confirmDisable = () => {
    updateSettings({ archiveEnabled: false });
    setShowDisableModal(false);
  };

  const handleRetentionBlur = () => {
    const days = parseInt(retentionDays, 10);
    if (!isNaN(days) && days >= 0 && days !== settings?.archiveRetentionDays) {
      updateSettings({ archiveRetentionDays: days });
    }
  };

  const handleRetentionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRetentionBlur();
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="bg-surface-secondary rounded-lg p-4 border border-border">
          <h3 className="text-sm font-medium text-text-primary mb-1">Archive</h3>
          <p className="text-xs text-text-muted mb-4">
            When enabled, deleted tasks are moved to the Archive instead of being permanently removed.
            Archived tasks can be restored to their original board or permanently deleted from the Archive view.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Enable task archiving</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings?.archiveEnabled ?? false}
              onClick={handleToggle}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                settings?.archiveEnabled ? 'bg-primary-500' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  settings?.archiveEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>
        </div>

        {settings?.archiveEnabled && (
          <div className="bg-surface-secondary rounded-lg p-4 border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-1">Retention Period</h3>
            <p className="text-xs text-text-muted mb-3">
              Archived tasks older than this will be automatically purged. Set to 0 to keep tasks indefinitely.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                onBlur={handleRetentionBlur}
                onKeyDown={handleRetentionKeyDown}
                className="w-20 px-2 py-1 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
              />
              <span className="text-sm text-text-secondary">days</span>
            </div>
          </div>
        )}
      </div>

      {/* Disable Confirmation Modal */}
      {showDisableModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Disable Archive?</h3>
            </div>
            <p className="text-sm text-text-secondary mb-2">
              Disabling the archive will <span className="font-medium text-text-primary">permanently remove all archived tasks</span>.
            </p>
            <p className="text-sm text-text-muted mb-5">
              This action cannot be undone. Future deletions will be permanent.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDisableModal(false)}
                className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmDisable}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50"
              >
                Disable & Purge
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
