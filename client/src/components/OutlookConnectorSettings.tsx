import { useState, useEffect } from 'react';
import { Loader2, Info } from 'lucide-react';
import * as api from '../api';
import type { EmailSettings } from '../types';

export function OutlookConnectorSettings() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [imapHost, setImapHost] = useState('outlook.office365.com');
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState('smtp.office365.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pollingInterval, setPollingInterval] = useState(60);
  const [active, setActive] = useState(false);
  const [replyTemplate, setReplyTemplate] = useState('');
  const [signature, setSignature] = useState('');
  const [showTemplateInfo, setShowTemplateInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getEmailSettings('outlook')
      .then((data) => {
        setSettings(data);
        if (data) {
          setDisplayName(data.displayName);
          setEmailAddress(data.emailAddress);
          setImapHost(data.imapHost);
          setImapPort(data.imapPort);
          setSmtpHost(data.smtpHost);
          setSmtpPort(data.smtpPort);
          setUsername(data.username);
          setPollingInterval(data.pollingInterval);
          setActive(data.active);
          setReplyTemplate(data.replyTemplate);
          setSignature(data.signature);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!displayName.trim() || !emailAddress.trim() || !username.trim() || !password.trim()) {
      setFeedback({ type: 'error', message: 'Display Name, Email, Username, and Password are required' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const saved = await api.saveEmailSettings({
        provider: 'outlook',
        displayName: displayName.trim(),
        emailAddress: emailAddress.trim(),
        imapHost: imapHost.trim(),
        imapPort,
        smtpHost: smtpHost.trim(),
        smtpPort,
        username: username.trim(),
        password: password.trim(),
        pollingInterval,
        active,
        replyTemplate: replyTemplate.trim() || undefined,
        signature: signature.trim() || undefined,
      });
      setSettings(saved);
      setPassword('');
      setFeedback({ type: 'success', message: 'Outlook settings saved' });
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
      const result = await api.testEmailConnection();
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
        Outlook (Office 365)
      </h3>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Email Address</label>
            <input
              type="email"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder="john@company.com"
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">IMAP Host</label>
            <input
              type="text"
              value={imapHost}
              onChange={(e) => setImapHost(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">IMAP Port</label>
            <input
              type="number"
              value={imapPort}
              onChange={(e) => setImapPort(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">SMTP Host</label>
            <input
              type="text"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">SMTP Port</label>
            <input
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="john@company.com"
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings?.passwordConfigured ? settings.passwordMasked : 'Enter password'}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Polling Interval (seconds)</label>
            <input
              type="number"
              value={pollingInterval}
              onChange={(e) => setPollingInterval(Number(e.target.value) || 60)}
              min={10}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
              />
              Active
            </label>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="text-sm text-text-secondary">
              Reply Template (optional)
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTemplateInfo(!showTemplateInfo)}
                className="text-text-muted hover:text-text-secondary transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
              {showTemplateInfo && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-surface-secondary border border-border rounded-md shadow-lg p-3 z-10">
                  <p className="text-xs font-medium text-text-primary mb-1.5">Template Variables</p>
                  <ul className="text-xs text-text-secondary space-y-1">
                    <li><code className="text-primary-500">{'{{taskTitle}}'}</code> — Task name</li>
                    <li><code className="text-primary-500">{'{{senderName}}'}</code> — Email sender</li>
                    <li><code className="text-primary-500">{'{{completionDate}}'}</code> — Completion date</li>
                    <li><code className="text-primary-500">{'{{signature}}'}</code> — Your signature</li>
                  </ul>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-surface-secondary border-r border-b border-border rotate-45 -mt-1" />
                </div>
              )}
            </div>
          </div>
          <textarea
            value={replyTemplate}
            onChange={(e) => setReplyTemplate(e.target.value)}
            placeholder="e.g. Hi {{senderName}}, regarding {{taskTitle}}..."
            rows={3}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Signature (optional)
          </label>
          <textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Best regards,&#10;John Doe"
            rows={2}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary resize-none"
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
            disabled={testing || !settings?.passwordConfigured}
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
