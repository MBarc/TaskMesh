import { useState, useEffect, useRef } from 'react';
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight, Info, FolderOpen, Upload, ClipboardPaste } from 'lucide-react';
import * as api from '../api';
import type { DocumentationSettings, DocumentationTemplate } from '../types';

export function DocumentationSettingsPanel() {
  const [, setSettings] = useState<DocumentationSettings | null>(null);
  const [subfolder, setSubfolder] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [templates, setTemplates] = useState<DocumentationTemplate[]>([]);
  const [customVariables, setCustomVariables] = useState<{ name: string; description: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [editingTemplateIdx, setEditingTemplateIdx] = useState<number | null>(null);
  const [variablesExpanded, setVariablesExpanded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getDocumentationSettings()
      .then((data) => {
        setSettings(data);
        if (data) {
          setSubfolder(data.subfolder);
          setLocalPath(data.localPath || '');
          setTemplates(data.templates || []);
          setCustomVariables(data.customVariables || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await api.saveDocumentationSettings({
        subfolder: subfolder.trim(),
        templates,
        customVariables,
      });
      setSettings(saved);
      setFeedback({ type: 'success', message: 'Settings saved' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = () => {
    const newTemplate: DocumentationTemplate = {
      id: `tpl-${Date.now()}`,
      name: '',
      content: '',
      namingConvention: '{task_name}',
      customVariables: [],
    };
    setTemplates([...templates, newTemplate]);
    setEditingTemplateIdx(templates.length);
  };

  const updateTemplate = (index: number, updates: Partial<DocumentationTemplate>) => {
    const updated = [...templates];
    updated[index] = { ...updated[index], ...updates };
    setTemplates(updated);
  };

  const removeTemplate = (index: number) => {
    setTemplates(templates.filter((_, i) => i !== index));
    if (editingTemplateIdx === index) setEditingTemplateIdx(null);
  };

  const addCustomVariable = () => {
    setCustomVariables([...customVariables, { name: '', description: '' }]);
  };

  const updateCustomVariable = (index: number, updates: Partial<{ name: string; description: string }>) => {
    const updated = [...customVariables];
    updated[index] = { ...updated[index], ...updates };
    setCustomVariables(updated);
  };

  const removeCustomVariable = (index: number) => {
    setCustomVariables(customVariables.filter((_, i) => i !== index));
  };

  const handleImportTemplates = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setImporting(true);
    setFeedback(null);
    try {
      const templatePayloads: { fileName: string; content: string }[] = [];
      for (const file of Array.from(files)) {
        const content = await file.text();
        templatePayloads.push({ fileName: file.name, content });
      }

      const result = await api.importDocumentationTemplates(templatePayloads);
      setTemplates(result.templates || []);
      setCustomVariables(result.customVariables || []);
      setFeedback({
        type: 'success',
        message: `Imported ${result.imported} template${result.imported !== 1 ? 's' : ''}${result.newVariables > 0 ? ` with ${result.newVariables} new variable${result.newVariables !== 1 ? 's' : ''}` : ''}`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to import templates' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteImport = async () => {
    if (!pasteContent.trim()) return;

    setImporting(true);
    setFeedback(null);
    try {
      const result = await api.importDocumentationTemplates([
        { fileName: 'pasted-template.md', content: pasteContent },
      ]);
      setTemplates(result.templates || []);
      setCustomVariables(result.customVariables || []);
      setFeedback({
        type: 'success',
        message: `Imported ${result.imported} template${result.imported !== 1 ? 's' : ''}${result.newVariables > 0 ? ` with ${result.newVariables} new variable${result.newVariables !== 1 ? 's' : ''}` : ''}`,
      });
      setPasteContent('');
      setPasteMode(false);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to import template' });
    } finally {
      setImporting(false);
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
        Documentation Settings
      </h3>

      <div className="space-y-3">
        {/* Save Path Display */}
        <div>
          <label className="flex items-center gap-1.5 text-sm text-text-secondary mb-1">
            <FolderOpen className="w-3.5 h-3.5" />
            Save Location
          </label>
          {localPath ? (
            <div className="px-3 py-2 text-sm bg-surface-tertiary border border-border rounded-md text-text-primary font-mono">
              {localPath.replace(/\\/g, '/')}{subfolder ? `/${subfolder}` : ''}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm bg-amber-50 border border-amber-200 rounded-md text-amber-700">
              Not configured. Set <code className="bg-amber-100 px-1 rounded">DOCUMENTATION_PATH</code> in your <code className="bg-amber-100 px-1 rounded">.env</code> file and restart the containers.
            </div>
          )}
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-sm text-text-secondary mb-1">
            Subfolder (optional)
            <span className="relative group">
              <Info className="w-3.5 h-3.5 text-text-muted cursor-help" />
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 text-xs bg-surface-secondary border border-border rounded shadow-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                Documents will be saved inside this folder within the save location
              </span>
            </span>
          </label>
          <input
            type="text"
            value={subfolder}
            onChange={(e) => setSubfolder(e.target.value)}
            placeholder="e.g. Runbooks"
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        </div>

        {/* Default variables */}
        <div>
          <label className="block text-sm text-text-secondary mb-1">
            Default Variables
          </label>
          <div className="flex flex-wrap gap-1.5">
            {['{task_name}', '{date_created}', '{board_name}'].map((v) => (
              <span
                key={v}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"
              >
                {v}
              </span>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-1">
            Column values are also available as variables, e.g. {'{column_name}'}.
          </p>
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
        </div>

        {/* Custom Variables */}
        <div className="border-t border-border pt-3 mt-3">
          <button
            onClick={() => setVariablesExpanded(!variablesExpanded)}
            className="flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-text-secondary w-full text-left"
          >
            {variablesExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Custom Variables ({customVariables.length})
          </button>

          {variablesExpanded && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                <span className="flex-1">Variable name</span>
                <span className="flex-1 flex items-center gap-1">
                  AI Instructions
                  <span className="relative group">
                    <Info className="w-3 h-3 cursor-help" />
                    <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 text-xs bg-surface-secondary border border-border rounded shadow-lg w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                      Tell the AI what content to generate for this variable when using auto-fill
                    </span>
                  </span>
                </span>
                <span className="w-6"></span>
              </div>
              {customVariables.map((v, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={v.name}
                    onChange={(e) => updateCustomVariable(idx, { name: e.target.value })}
                    placeholder="e.g. project_type"
                    className="flex-1 px-2 py-1 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary"
                  />
                  <input
                    type="text"
                    value={v.description}
                    onChange={(e) => updateCustomVariable(idx, { description: e.target.value })}
                    placeholder="e.g. Describe the project category"
                    className="flex-1 px-2 py-1 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary"
                  />
                  <button
                    onClick={() => removeCustomVariable(idx)}
                    className="p-1 text-text-muted hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addCustomVariable}
                className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600"
              >
                <Plus className="w-4 h-4" />
                Add variable
              </button>
            </div>
          )}
        </div>

        {/* Templates */}
        <div className="border-t border-border pt-3 mt-3">
          <button
            onClick={() => setTemplatesExpanded(!templatesExpanded)}
            className="flex items-center gap-1.5 text-sm font-medium text-text-primary hover:text-text-secondary w-full text-left"
          >
            {templatesExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Templates ({templates.length})
          </button>

          {templatesExpanded && (
            <div className="mt-3 space-y-3">
              {templates.map((tpl, idx) => (
                <div
                  key={tpl.id}
                  className="bg-surface rounded-md border border-border p-3 space-y-2"
                >
                  {editingTemplateIdx === idx ? (
                    <>
                      <div>
                        <label className="block text-xs text-text-muted mb-0.5">Template Name</label>
                        <input
                          type="text"
                          value={tpl.name}
                          onChange={(e) => updateTemplate(idx, { name: e.target.value })}
                          placeholder="e.g. Design Document"
                          className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-0.5">Naming Convention</label>
                        <input
                          type="text"
                          value={tpl.namingConvention}
                          onChange={(e) => updateTemplate(idx, { namingConvention: e.target.value })}
                          placeholder="{task_name} - Design"
                          className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-0.5">Markdown Content</label>
                        <textarea
                          value={tpl.content}
                          onChange={(e) => updateTemplate(idx, { content: e.target.value })}
                          rows={6}
                          placeholder="# {task_name}&#10;&#10;## Overview&#10;&#10;## Requirements&#10;"
                          className="w-full px-2 py-1.5 text-xs bg-surface-secondary border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary resize-y font-mono"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingTemplateIdx(null)}
                          className="px-3 py-1 text-sm bg-primary-500 text-white rounded hover:bg-primary-600"
                        >
                          Done
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-text-primary">{tpl.name || 'Untitled template'}</div>
                        <div className="text-xs text-text-muted">Naming: {tpl.namingConvention || '-'}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingTemplateIdx(idx)}
                          className="px-2 py-1 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeTemplate(idx)}
                          className="p-1 text-text-muted hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {pasteMode ? (
                <div className="space-y-2 bg-surface rounded-md border border-border p-3">
                  <label className="block text-xs text-text-muted">
                    Paste template content with YAML frontmatter
                  </label>
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    rows={12}
                    placeholder={"---\nname: Template Name\nnamingConvention: \"{task_name} - Document\"\nvariables:\n  - name: variable_name\n    description: What this variable represents\n---\n\n# {task_name}\n\nTemplate content here..."}
                    className="w-full px-3 py-2 text-xs bg-surface-secondary border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary resize-y font-mono"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePasteImport}
                      disabled={importing || !pasteContent.trim()}
                      className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {importing && <Loader2 className="w-3 h-3 animate-spin" />}
                      Import
                    </button>
                    <button
                      onClick={() => { setPasteMode(false); setPasteContent(''); }}
                      className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary border border-border rounded-md hover:bg-surface-tertiary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={addTemplate}
                    className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600"
                  >
                    <Plus className="w-4 h-4" />
                    Add template
                  </button>
                  <button
                    onClick={() => setPasteMode(true)}
                    className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600"
                  >
                    <ClipboardPaste className="w-4 h-4" />
                    Paste template
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md"
                    multiple
                    onChange={handleImportTemplates}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Import from file
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
