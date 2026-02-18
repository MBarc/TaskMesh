import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import * as api from '../api';
import type { SnowSettings } from '../types';

export function SnowConnectorSettings() {
  const [settings, setSettings] = useState<SnowSettings | null>(null);
  const [instanceUrl, setInstanceUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSnowSettings()
      .then((data) => {
        setSettings(data);
        if (data) {
          setInstanceUrl(data.instanceUrl);
          setAssignedTo(data.assignedTo || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!instanceUrl.trim() || !apiKey.trim()) {
      setFeedback({ type: 'error', message: 'Instance URL and API Key are required' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const saved = await api.saveSnowSettings({
        instanceUrl: instanceUrl.trim(),
        apiKey: apiKey.trim(),
        assignedTo: assignedTo.trim() || undefined,
      });
      setSettings(saved);
      setApiKey('');
      setFeedback({ type: 'success', message: 'Settings saved' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const result = await api.testSnowConnection();
      setFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to test connection' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-text-primary mb-3">
        ServiceNow
      </h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Instance URL
          </label>
          <input
            type="text"
            value={instanceUrl}
            onChange={(e) => setInstanceUrl(e.target.value)}
            placeholder="https://mycompany.service-now.com"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.apiKeyConfigured ? settings.apiKeyMasked : 'Enter API Key'}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Assigned To (optional)
          </label>
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="e.g. user@example.com"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        </div>

        {feedback && (
          <div
            className={`text-sm px-3 py-2 rounded-md ${
              feedback.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save
          </button>
          <button
            onClick={handleTestConnection}
            disabled={testing || !settings?.apiKeyConfigured}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {testing && <Loader2 className="w-3 h-3 animate-spin" />}
            Test Connection
          </button>
        </div>
      </div>
    </div>
  );
}
