import { useState, useEffect } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import * as api from '../api';
import type { AdoSettings, AdoWorkItemType, AdoTemplatesConfig, AdoMetadataTemplatesConfig, AdoFieldName, AdoMetadataFieldName } from '../types';
import { ADO_WORK_ITEM_FIELDS, ADO_FIELD_LABELS, ADO_METADATA_FIELDS, ADO_METADATA_FIELD_LABELS } from '../types';

const TEMPLATE_TYPES: AdoWorkItemType[] = [
  'Epic',
  'Feature',
  'Product Backlog Item',
  'User Story',
  'Task',
  'Bug',
  'Issue',
];

export function ConnectorSettings() {
  const [settings, setSettings] = useState<AdoSettings | null>(null);
  const [orgUrl, setOrgUrl] = useState('');
  const [projectName, setProjectName] = useState('');
  const [pat, setPat] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Template state
  const [templates, setTemplates] = useState<AdoTemplatesConfig>({});
  const [metadataTemplates, setMetadataTemplates] = useState<AdoMetadataTemplatesConfig>({});
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [activeTemplateType, setActiveTemplateType] = useState<AdoWorkItemType>('Task');

  useEffect(() => {
    api.getAdoSettings()
      .then((data) => {
        setSettings(data);
        if (data) {
          setOrgUrl(data.organizationUrl);
          setProjectName(data.projectName);
          setAssignedTo(data.assignedTo || '');
          setTemplates(data.templates || {});
          setMetadataTemplates(data.metadataTemplates || {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateTemplate = (
    type: AdoWorkItemType,
    field: AdoFieldName,
    key: 'defaultText' | 'aiInstructions',
    value: string,
  ) => {
    setTemplates((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: {
          defaultText: '',
          aiInstructions: '',
          ...prev[type]?.[field],
          [key]: value,
        },
      },
    }));
  };

  const updateMetadataTemplate = (
    type: AdoWorkItemType,
    field: AdoMetadataFieldName,
    value: string,
  ) => {
    setMetadataTemplates((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: {
          ...prev[type]?.[field],
          aiInstructions: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    if (!orgUrl.trim() || !projectName.trim() || !pat.trim() || !assignedTo.trim()) {
      setFeedback({ type: 'error', message: 'All fields are required' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const saved = await api.saveAdoSettings({
        organizationUrl: orgUrl.trim(),
        projectName: projectName.trim(),
        pat: pat.trim(),
        assignedTo: assignedTo.trim() || undefined,
        templates,
        metadataTemplates,
      });
      setSettings(saved);
      setPat('');
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
      const result = await api.testAdoConnection();
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

  const activeFields = ADO_WORK_ITEM_FIELDS[activeTemplateType] || [];

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-text-primary mb-3">
        Azure DevOps
      </h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Organization URL
          </label>
          <input
            type="text"
            value={orgUrl}
            onChange={(e) => setOrgUrl(e.target.value)}
            placeholder="https://dev.azure.com/your-org"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Project Name
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="MyProject"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Personal Access Token (PAT)
          </label>
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder={settings?.patConfigured ? settings.patMasked : 'Enter PAT'}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Assign To
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
            disabled={testing || !settings?.patConfigured}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {testing && <Loader2 className="w-3 h-3 animate-spin" />}
            Test Connection
          </button>
        </div>

        {/* Work Item Templates */}
        <div className="border-t border-border pt-3 mt-3">
          <button
            onClick={() => setTemplatesExpanded(!templatesExpanded)}
            className="flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-text-secondary w-full text-left"
          >
            {templatesExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Work Item Templates
          </button>

          {templatesExpanded && (
            <div className="mt-3 space-y-3">
              {/* Type pill tabs */}
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setActiveTemplateType(type)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      activeTemplateType === type
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-text-muted'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Field editors for active type */}
              <div className="space-y-3">
                {activeFields.map((fieldName) => (
                  <div
                    key={fieldName}
                    className="bg-surface rounded-md border border-border p-3 space-y-2"
                  >
                    <div className="text-xs font-medium text-text-primary">
                      {ADO_FIELD_LABELS[fieldName]}
                    </div>

                    <div>
                      <label className="block text-xs text-text-muted mb-0.5">
                        Default Text / Boilerplate
                      </label>
                      <textarea
                        value={templates[activeTemplateType]?.[fieldName]?.defaultText || ''}
                        onChange={(e) =>
                          updateTemplate(activeTemplateType, fieldName, 'defaultText', e.target.value)
                        }
                        rows={2}
                        placeholder="Pre-populated content for this field..."
                        className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary resize-y"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-text-muted mb-0.5">
                        AI Instructions
                      </label>
                      <textarea
                        value={templates[activeTemplateType]?.[fieldName]?.aiInstructions || ''}
                        onChange={(e) =>
                          updateTemplate(activeTemplateType, fieldName, 'aiInstructions', e.target.value)
                        }
                        rows={2}
                        placeholder="Instructions for AI generation (e.g. 'Write a detailed bug report with steps to reproduce')..."
                        className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary resize-y"
                      />
                    </div>
                  </div>
                ))}

                {/* Metadata field AI Instructions */}
                {(ADO_METADATA_FIELDS[activeTemplateType] || []).map((metaField) => (
                  <div
                    key={metaField}
                    className="bg-surface rounded-md border border-border p-3 space-y-2"
                  >
                    <div className="text-xs font-medium text-text-primary">
                      {ADO_METADATA_FIELD_LABELS[metaField]}
                    </div>

                    <div>
                      <label className="block text-xs text-text-muted mb-0.5">
                        AI Instructions
                      </label>
                      <textarea
                        value={metadataTemplates[activeTemplateType]?.[metaField]?.aiInstructions || ''}
                        onChange={(e) =>
                          updateMetadataTemplate(activeTemplateType, metaField, e.target.value)
                        }
                        rows={2}
                        placeholder="Instructions for AI generation of this metadata field..."
                        className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary resize-y"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
