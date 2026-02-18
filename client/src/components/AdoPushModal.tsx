import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, X, Search, Sparkles } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { AdoWorkItemType, AdoWorkItemSearchResult, AdoSettings, AdoFieldName, AdoMetadataFieldName } from '../types';
import { ADO_WORK_ITEM_FIELDS, ADO_FIELD_LABELS, ADO_METADATA_FIELDS } from '../types';

const WORK_ITEM_TYPES: AdoWorkItemType[] = [
  'Epic',
  'Feature',
  'Product Backlog Item',
  'User Story',
  'Task',
  'Bug',
  'Issue',
];

// ADO's actual work item type hex colors
const ADO_TYPE_COLORS: Record<string, string> = {
  'Epic': '#FF7B00',
  'Feature': '#773B93',
  'Product Backlog Item': '#009CCC',
  'User Story': '#009CCC',
  'Task': '#F2CB1D',
  'Bug': '#CC293D',
  'Issue': '#B4009E',
};

export function AdoPushModal() {
  const { adoPushModal, closeAdoPushModal } = useBoardStore();
  const [workItemType, setWorkItemType] = useState<AdoWorkItemType | ''>('');
  const [parentSearch, setParentSearch] = useState('');
  const [parentResults, setParentResults] = useState<AdoWorkItemSearchResult[]>([]);
  const [selectedParent, setSelectedParent] = useState<AdoWorkItemSearchResult | null>(null);
  const [searchingParent, setSearchingParent] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New detail fields
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<number | null>(null);
  const [effort, setEffort] = useState('');
  const [severity, setSeverity] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [tagResults, setTagResults] = useState<string[]>([]);
  const [searchingTags, setSearchingTags] = useState(false);
  const tagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Field editing state
  const [adoSettings, setAdoSettings] = useState<AdoSettings | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<AdoFieldName, string>>({
    description: '',
    acceptanceCriteria: '',
    reproSteps: '',
  });
  const [generatingField, setGeneratingField] = useState<AdoFieldName | null>(null);
  const [generatingMetadata, setGeneratingMetadata] = useState<AdoMetadataFieldName | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  // Load ADO settings on modal open to get templates
  useEffect(() => {
    if (adoPushModal) {
      setWorkItemType('');
      setTitle(adoPushModal.taskTitle || '');
      setPriority(null);
      setEffort('');
      setSeverity('');
      setTags([]);
      setTagSearch('');
      setTagResults([]);
      setSearchingTags(false);
      setParentSearch('');
      setParentResults([]);
      setSelectedParent(null);
      setSearchingParent(false);
      setError(null);
      setGeneratingField(null);
      setGeneratingMetadata(null);
      setGeneratingAll(false);
      setFieldValues({ description: '', acceptanceCriteria: '', reproSteps: '' });

      api.getAdoSettings().then((settings) => {
        setAdoSettings(settings);
      }).catch(() => {
        setAdoSettings(null);
      });
    }
  }, [adoPushModal]);

  // Re-populate field defaults when work item type changes
  useEffect(() => {
    if (!adoSettings || !workItemType) {
      setFieldValues({ description: '', acceptanceCriteria: '', reproSteps: '' });
      return;
    }
    const typeTemplates = adoSettings.templates?.[workItemType];
    setFieldValues({
      description: typeTemplates?.description?.defaultText || '',
      acceptanceCriteria: typeTemplates?.acceptanceCriteria?.defaultText || '',
      reproSteps: typeTemplates?.reproSteps?.defaultText || '',
    });
    // Reset severity when switching away from Bug
    if (workItemType !== 'Bug') {
      setSeverity('');
    }
  }, [workItemType, adoSettings]);

  useEffect(() => {
    if (!adoPushModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAdoPushModal();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [adoPushModal, closeAdoPushModal]);

  const searchWorkItems = useCallback(async (query: string) => {
    if (!query.trim()) {
      setParentResults([]);
      setSearchingParent(false);
      return;
    }

    setSearchingParent(true);
    try {
      const results = await api.searchAdoWorkItems(query);
      setParentResults(results);
    } catch {
      setParentResults([]);
    } finally {
      setSearchingParent(false);
    }
  }, []);

  const handleParentSearchChange = (value: string) => {
    setParentSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchWorkItems(value), 400);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current);
    };
  }, []);

  if (!adoPushModal) return null;

  const DEFAULT_AI_INSTRUCTIONS: Record<AdoFieldName, string> = {
    description: `Write a clear, concise description for this ${workItemType} based on the task context. Use professional language suitable for Azure DevOps.`,
    acceptanceCriteria: `Write acceptance criteria for this ${workItemType} as a bulleted list. Each criterion should be specific and testable.`,
    reproSteps: `Write clear reproduction steps for this ${workItemType} as a numbered list. Include expected vs actual behavior.`,
  };

  const handleGenerateField = async (fieldName: AdoFieldName) => {
    if (!workItemType) return;
    const aiInstructions =
      adoSettings?.templates?.[workItemType]?.[fieldName]?.aiInstructions
      || DEFAULT_AI_INSTRUCTIONS[fieldName];

    setGeneratingField(fieldName);
    setError(null);
    try {
      const result = await api.generateAdoField({
        taskId: adoPushModal.taskId,
        fieldName,
        workItemType,
        aiInstructions,
        title: title || undefined,
      });
      setFieldValues((prev) => ({ ...prev, [fieldName]: result.content }));
    } catch (err: any) {
      setError(err.message || 'Failed to generate field content');
    } finally {
      setGeneratingField(null);
    }
  };

  const DEFAULT_METADATA_AI_INSTRUCTIONS: Record<AdoMetadataFieldName, string> = {
    priority: `Assess the priority of this ${workItemType} based on the task context. Output ONLY a single number: 1 for Critical, 2 for High, 3 for Medium, 4 for Low.`,
    effort: `Estimate the effort for this ${workItemType} based on the task context. Output ONLY a single number representing story points (use fibonacci-like scale: 1, 2, 3, 5, 8, 13).`,
    severity: `Assess the severity of this Bug based on the task context. Output ONLY one of: 1 - Critical, 2 - High, 3 - Medium, 4 - Low`,
    tags: `Suggest relevant tags for this ${workItemType} based on the task context. Output ONLY a comma-separated list of short tags.`,
  };

  const handleGenerateMetadataField = async (fieldName: AdoMetadataFieldName) => {
    if (!workItemType) return;
    const aiInstructions =
      adoSettings?.metadataTemplates?.[workItemType]?.[fieldName]?.aiInstructions
      || DEFAULT_METADATA_AI_INSTRUCTIONS[fieldName];

    setGeneratingMetadata(fieldName);
    setError(null);
    try {
      const result = await api.generateAdoField({
        taskId: adoPushModal.taskId,
        fieldName,
        workItemType,
        aiInstructions,
        title: title || undefined,
      });

      const raw = result.content.trim();

      switch (fieldName) {
        case 'priority': {
          const digitMatch = raw.match(/[1-4]/);
          const parsed = digitMatch ? parseInt(digitMatch[0], 10) : NaN;
          setPriority(parsed >= 1 && parsed <= 4 ? parsed : null);
          break;
        }
        case 'effort': {
          const numMatch = raw.match(/[\d.]+/);
          const num = numMatch ? parseFloat(numMatch[0]) : NaN;
          setEffort(isNaN(num) ? '' : String(num));
          break;
        }
        case 'severity': {
          const known = ['1 - Critical', '2 - High', '3 - Medium', '4 - Low'];
          const match = known.find((k) => raw.includes(k));
          setSeverity(match || '');
          break;
        }
        case 'tags': {
          const newTags = raw.split(',').map((t) => t.trim()).filter(Boolean);
          setTags((prev) => {
            const combined = [...prev];
            for (const t of newTags) {
              if (!combined.includes(t)) combined.push(t);
            }
            return combined;
          });
          break;
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate field content');
    } finally {
      setGeneratingMetadata(null);
    }
  };

  const handleGenerateAll = async () => {
    if (!workItemType) return;
    setGeneratingAll(true);
    setError(null);

    const richTextFields = ADO_WORK_ITEM_FIELDS[workItemType];
    const metadataFields = ADO_METADATA_FIELDS[workItemType];

    type GenerateJob =
      | { type: 'richText'; fieldName: AdoFieldName }
      | { type: 'metadata'; fieldName: AdoMetadataFieldName };

    const jobs: GenerateJob[] = [
      ...richTextFields.map((f) => ({ type: 'richText' as const, fieldName: f })),
      ...metadataFields.map((f) => ({ type: 'metadata' as const, fieldName: f })),
    ];

    let failures = 0;

    // Run sequentially to avoid overwhelming Ollama with concurrent requests
    for (const job of jobs) {
      try {
        const aiInstructions = job.type === 'richText'
          ? (adoSettings?.templates?.[workItemType]?.[job.fieldName]?.aiInstructions
            || DEFAULT_AI_INSTRUCTIONS[job.fieldName])
          : (adoSettings?.metadataTemplates?.[workItemType]?.[job.fieldName]?.aiInstructions
            || DEFAULT_METADATA_AI_INSTRUCTIONS[job.fieldName]);

        const result = await api.generateAdoField({
          taskId: adoPushModal.taskId,
          fieldName: job.fieldName,
          workItemType,
          aiInstructions,
          title: title || undefined,
        });

        const raw = result.content.trim();

        if (job.type === 'richText') {
          setFieldValues((prev) => ({ ...prev, [job.fieldName]: result.content }));
        } else {
          switch (job.fieldName) {
            case 'priority': {
              const digitMatch = raw.match(/[1-4]/);
              const parsed = digitMatch ? parseInt(digitMatch[0], 10) : NaN;
              setPriority(parsed >= 1 && parsed <= 4 ? parsed : null);
              break;
            }
            case 'effort': {
              const numMatch = raw.match(/[\d.]+/);
              const num = numMatch ? parseFloat(numMatch[0]) : NaN;
              setEffort(isNaN(num) ? '' : String(num));
              break;
            }
            case 'severity': {
              const known = ['1 - Critical', '2 - High', '3 - Medium', '4 - Low'];
              const match = known.find((k) => raw.includes(k));
              setSeverity(match || '');
              break;
            }
            case 'tags': {
              const newTags = raw.split(',').map((t) => t.trim()).filter(Boolean);
              setTags((prev) => {
                const combined = [...prev];
                for (const t of newTags) {
                  if (!combined.includes(t)) combined.push(t);
                }
                return combined;
              });
              break;
            }
          }
        }
      } catch {
        failures++;
      }
    }

    if (failures > 0) {
      setError(failures === jobs.length
        ? 'Failed to generate all fields'
        : `Failed to generate ${failures} of ${jobs.length} fields`);
    }

    setGeneratingAll(false);
  };

  const activeFields: AdoFieldName[] = workItemType ? ADO_WORK_ITEM_FIELDS[workItemType] : [];

  const createFormValid = (() => {
    if (!workItemType) return false;
    if (!title.trim()) return false;
    if (!selectedParent) return false;
    if (tags.length === 0) return false;
    for (const f of activeFields) {
      if (!fieldValues[f]?.trim()) return false;
    }
    if (priority == null) return false;
    if (!effort.trim()) return false;
    if (workItemType === 'Bug' && !severity) return false;
    return true;
  })();

  const handlePush = async () => {
    if (!workItemType) { setError('Type is required'); return; }
    if (!title.trim()) { setError('Title is required'); return; }
    if (!selectedParent) { setError('A parent work item is required'); return; }
    for (const f of activeFields) {
      if (!fieldValues[f]?.trim()) { setError(`${ADO_FIELD_LABELS[f]} is required`); return; }
    }
    if (priority == null) { setError('Priority is required'); return; }
    if (!effort.trim()) { setError(`${effortLabel} is required`); return; }
    if (workItemType === 'Bug' && !severity) { setError('Severity is required'); return; }
    if (tags.length === 0) { setError('At least one tag is required'); return; }

    setPushing(true);
    setError(null);

    const fieldPayload: Record<string, string> = {};
    for (const f of activeFields) {
      fieldPayload[f] = fieldValues[f];
    }

    try {
      const updatedTask = await api.pushToAdo({
        taskId: adoPushModal.taskId,
        columnId: adoPushModal.columnId,
        title,
        workItemType,
        parentWorkItemId: selectedParent!.id,
        ...fieldPayload,
        priority: priority!,
        effort: parseFloat(effort),
        severity: severity || undefined,
        tags: tags.join('; '),
      });

      // Update the task in the store
      const { currentBoard } = useBoardStore.getState();
      if (currentBoard) {
        useBoardStore.setState({
          currentBoard: {
            ...currentBoard,
            tasks: currentBoard.tasks.map((t) =>
              t.id === updatedTask.id ? updatedTask : t
            ),
          },
        });
      }

      closeAdoPushModal();
    } catch (err: any) {
      setError(err.message || 'Failed to push to ADO');
    } finally {
      setPushing(false);
    }
  };

  const typeColor = workItemType ? (ADO_TYPE_COLORS[workItemType] || '#0078d4') : '#c8c6c4';

  // Effort label depends on work item type
  const effortLabel = (() => {
    if (workItemType === 'Task') return 'Remaining Work (hours)';
    if (workItemType === 'Product Backlog Item' || workItemType === 'Issue') return 'Effort';
    return 'Story Points';
  })();

  const handleTagSearchChange = (value: string) => {
    setTagSearch(value);
    if (tagDebounceRef.current) clearTimeout(tagDebounceRef.current);
    if (!value.trim()) {
      setTagResults([]);
      setSearchingTags(false);
      return;
    }
    tagDebounceRef.current = setTimeout(async () => {
      setSearchingTags(true);
      try {
        const results = await api.searchAdoTags(value);
        // Filter out already-selected tags
        setTagResults(results.map((t) => t.name).filter((n) => !tags.includes(n)));
      } catch {
        setTagResults([]);
      } finally {
        setSearchingTags(false);
      }
    }, 300);
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagSearch('');
    setTagResults([]);
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) closeAdoPushModal();
      }}
    >
      <div
        className="rounded-sm shadow-2xl w-full max-w-4xl overflow-hidden"
        style={{ fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif' }}
      >
        {/* Colored top bar matching work item type */}
        <div className="h-1" style={{ backgroundColor: typeColor }} />

        {/* Header — ADO-style */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#f8f8f8', borderBottom: '1px solid #edebe9' }}
        >
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M15 3.622v8.512L11.5 15l-5.425-1.975v1.958L3.004 11.1l8.951.7V4.056L15 3.622zm-2.984.428L7.208 1 2.983 2.258v8.29l-1.966-.238V3.373L7.208 1l4.808 3.05z" fill="#0078d4"/>
            </svg>
            <h2 className="text-sm font-semibold" style={{ color: '#323130' }}>
              New Work Item
            </h2>
          </div>
          <button
            onClick={closeAdoPushModal}
            className="p-1 rounded-sm hover:bg-black/5 transition-colors"
            style={{ color: '#605e5c' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Generate All bar */}
        <div
          className="flex justify-end px-5 py-2"
          style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #edebe9' }}
        >
          <button
            onClick={handleGenerateAll}
            disabled={!workItemType || generatingAll || generatingField !== null || generatingMetadata !== null || pushing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{
              color: '#ffffff',
              backgroundColor: '#0078d4',
            }}
            onMouseEnter={(e) => { if (!generatingAll) e.currentTarget.style.backgroundColor = '#106ebe'; }}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0078d4'}
            title="Generate all fields with AI"
          >
            {generatingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate All Fields
          </button>
        </div>

        {/* Content — two-column ADO-style layout */}
        <div
          className="max-h-[70vh] overflow-y-auto"
          style={{ backgroundColor: '#ffffff' }}
        >
          <div className="flex">
            {/* Left column — Title + rich text fields */}
            <div className="flex-1 min-w-0 px-5 py-4 space-y-5" style={{ borderRight: '1px solid #edebe9' }}>
              {/* Title — editable */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#605e5c' }}>
                  Title <span style={{ color: '#a4262c' }}>*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Work item title..."
                  className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #c8c6c4',
                    color: '#323130',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#0078d4'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#c8c6c4'}
                />
              </div>

              {/* Field editors — ADO-style labels + textareas */}
              {activeFields.map((fieldName) => {
                const isGenerating = generatingField === fieldName;

                return (
                  <div key={fieldName}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <label className="block text-xs font-semibold" style={{ color: '#605e5c' }}>
                        {ADO_FIELD_LABELS[fieldName]} <span style={{ color: '#a4262c' }}>*</span>
                      </label>
                      <button
                        onClick={() => handleGenerateField(fieldName)}
                        disabled={isGenerating || pushing || generatingAll}
                        className="p-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        style={{ color: '#0078d4' }}
                        title="Generate with AI using the task's title, column values, and source transcript (if available)"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <textarea
                      value={fieldValues[fieldName]}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [fieldName]: e.target.value }))
                      }
                      rows={4}
                      placeholder={`Enter ${ADO_FIELD_LABELS[fieldName].toLowerCase()}...`}
                      className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none resize-y"
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #c8c6c4',
                        color: '#323130',
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#0078d4'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#c8c6c4'}
                    />
                  </div>
                );
              })}
            </div>

            {/* Right column — metadata sidebar */}
            <div className="w-72 shrink-0 px-4 py-4 space-y-4" style={{ backgroundColor: '#faf9f8' }}>
              {/* Work item type selector */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#605e5c' }}>
                  Type <span style={{ color: '#a4262c' }}>*</span>
                </label>
                <div className="relative">
                  {workItemType && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-sm"
                      style={{ backgroundColor: typeColor }}
                    />
                  )}
                  <select
                    value={workItemType}
                    onChange={(e) => setWorkItemType(e.target.value as AdoWorkItemType | '')}
                    className="w-full py-2 pr-3 text-sm rounded-sm appearance-none focus:outline-none"
                    style={{
                      paddingLeft: workItemType ? '1rem' : '0.75rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #c8c6c4',
                      color: '#323130',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#0078d4'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#c8c6c4'}
                  >
                    <option value="">— None —</option>
                    {WORK_ITEM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="block text-xs font-semibold" style={{ color: '#605e5c' }}>
                    Priority <span style={{ color: '#a4262c' }}>*</span>
                  </label>
                  <button
                    onClick={() => handleGenerateMetadataField('priority')}
                    disabled={generatingMetadata === 'priority' || pushing || generatingAll}
                    className="p-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ color: '#0078d4' }}
                    title="Generate with AI"
                  >
                    {generatingMetadata === 'priority' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <div className="relative">
                  {priority != null && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-sm"
                      style={{
                        backgroundColor: priority === 1 ? '#CC293D' : priority === 2 ? '#FF7B00' : priority === 3 ? '#F2CB1D' : '#009CCC',
                      }}
                    />
                  )}
                  <select
                    value={priority ?? ''}
                    onChange={(e) => setPriority(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full py-2 pr-3 text-sm rounded-sm appearance-none focus:outline-none"
                    style={{
                      paddingLeft: priority != null ? '1rem' : '0.75rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #c8c6c4',
                      color: '#323130',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#0078d4'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#c8c6c4'}
                  >
                    <option value="">— None —</option>
                    <option value="1">1 - Critical</option>
                    <option value="2">2 - High</option>
                    <option value="3">3 - Medium</option>
                    <option value="4">4 - Low</option>
                  </select>
                </div>
              </div>

              {/* Effort / Story Points */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="block text-xs font-semibold" style={{ color: '#605e5c' }}>
                    {effortLabel} <span style={{ color: '#a4262c' }}>*</span>
                  </label>
                  <button
                    onClick={() => handleGenerateMetadataField('effort')}
                    disabled={generatingMetadata === 'effort' || pushing || generatingAll}
                    className="p-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ color: '#0078d4' }}
                    title="Generate with AI"
                  >
                    {generatingMetadata === 'effort' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                  placeholder={`Enter ${effortLabel.toLowerCase()}...`}
                  className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #c8c6c4',
                    color: '#323130',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#0078d4'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#c8c6c4'}
                />
              </div>

              {/* Severity (Bug only) */}
              {workItemType === 'Bug' && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="block text-xs font-semibold" style={{ color: '#605e5c' }}>
                      Severity <span style={{ color: '#a4262c' }}>*</span>
                    </label>
                    <button
                      onClick={() => handleGenerateMetadataField('severity')}
                      disabled={generatingMetadata === 'severity' || pushing || generatingAll}
                      className="p-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      style={{ color: '#0078d4' }}
                      title="Generate with AI"
                    >
                      {generatingMetadata === 'severity' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="relative">
                    {severity && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-sm"
                        style={{
                          backgroundColor: severity.startsWith('1') ? '#CC293D' : severity.startsWith('2') ? '#FF7B00' : severity.startsWith('3') ? '#F2CB1D' : '#009CCC',
                        }}
                      />
                    )}
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                      className="w-full py-2 pr-3 text-sm rounded-sm appearance-none focus:outline-none"
                      style={{
                        paddingLeft: severity ? '1rem' : '0.75rem',
                        backgroundColor: '#ffffff',
                        border: '1px solid #c8c6c4',
                        color: '#323130',
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#0078d4'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#c8c6c4'}
                    >
                      <option value="">— None —</option>
                      <option value="1 - Critical">1 - Critical</option>
                      <option value="2 - High">2 - High</option>
                      <option value="3 - Medium">3 - Medium</option>
                      <option value="4 - Low">4 - Low</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Parent Work Item */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#605e5c' }}>
                  Parent <span style={{ color: '#a4262c' }}>*</span>
                </label>

                {selectedParent ? (
                  <div
                    className="flex items-center gap-1.5 px-2 py-2 rounded-sm"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #edebe9' }}
                  >
                    <span
                      className="inline-block w-1 h-4 rounded-sm shrink-0"
                      style={{ backgroundColor: ADO_TYPE_COLORS[selectedParent.workItemType] || '#0078d4' }}
                    />
                    <span className="text-xs font-mono shrink-0" style={{ color: '#a19f9d' }}>
                      {selectedParent.id}
                    </span>
                    <span className="text-sm truncate flex-1" style={{ color: '#323130' }}>
                      {selectedParent.title}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedParent(null);
                        setParentSearch('');
                        setParentResults([]);
                      }}
                      className="p-0.5 rounded-sm hover:bg-black/10 transition-colors shrink-0"
                      style={{ color: '#605e5c' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                        style={{ color: '#a19f9d' }}
                      />
                      <input
                        type="text"
                        value={parentSearch}
                        onChange={(e) => handleParentSearchChange(e.target.value)}
                        placeholder="Search by title or ID..."
                        className="w-full pl-8 pr-8 py-2 text-sm rounded-sm focus:outline-none"
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #c8c6c4',
                          color: '#323130',
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = '#0078d4'}
                        onBlur={(e) => e.currentTarget.style.borderColor = '#c8c6c4'}
                      />
                      {searchingParent && (
                        <Loader2
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin"
                          style={{ color: '#0078d4' }}
                        />
                      )}
                    </div>

                    {parentResults.length > 0 && (
                      <div
                        className="absolute z-10 mt-1 w-full max-h-[200px] overflow-y-auto rounded-sm shadow-lg"
                        style={{ backgroundColor: '#ffffff', border: '1px solid #c8c6c4' }}
                      >
                        {parentResults.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setSelectedParent(item);
                              setParentSearch('');
                              setParentResults([]);
                            }}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors"
                            style={{ borderBottom: '1px solid #edebe9' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f2f1'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <span
                              className="inline-block w-1 h-4 rounded-sm shrink-0"
                              style={{ backgroundColor: ADO_TYPE_COLORS[item.workItemType] || '#0078d4' }}
                            />
                            <span className="text-xs font-mono shrink-0" style={{ color: '#a19f9d' }}>
                              {item.id}
                            </span>
                            <span className="text-xs truncate flex-1" style={{ color: '#323130' }}>
                              {item.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {parentSearch.trim() && !searchingParent && parentResults.length === 0 && (
                      <div
                        className="absolute z-10 mt-1 w-full rounded-sm shadow-lg px-3 py-2 text-sm"
                        style={{ backgroundColor: '#ffffff', border: '1px solid #c8c6c4', color: '#a19f9d' }}
                      >
                        No work items found
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tags autocomplete */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="block text-xs font-semibold" style={{ color: '#605e5c' }}>
                    Tags <span style={{ color: '#a4262c' }}>*</span>
                  </label>
                </div>
                {/* Selected tag chips */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs"
                        style={{ backgroundColor: '#e1dfdd', color: '#323130' }}
                      >
                        {tag}
                        <button
                          onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                          className="p-0 hover:text-red-600 transition-colors leading-none"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => handleTagSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagSearch.trim()) {
                        e.preventDefault();
                        addTag(tagSearch);
                      }
                    }}
                    placeholder="Search or add tags..."
                    className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none"
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #c8c6c4',
                      color: '#323130',
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#0078d4'}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#c8c6c4';
                      setTimeout(() => setTagResults([]), 200);
                    }}
                  />
                  {searchingTags && (
                    <Loader2
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin"
                      style={{ color: '#0078d4' }}
                    />
                  )}
                  {tagResults.length > 0 && (
                    <div
                      className="absolute z-10 mt-1 w-full max-h-[160px] overflow-y-auto rounded-sm shadow-lg"
                      style={{ backgroundColor: '#ffffff', border: '1px solid #c8c6c4' }}
                    >
                      {tagResults.map((tagName) => (
                        <button
                          key={tagName}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addTag(tagName)}
                          className="w-full px-3 py-1.5 text-sm text-left transition-colors"
                          style={{ borderBottom: '1px solid #edebe9', color: '#323130' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f2f1'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {tagName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Error — full width below columns */}
          {error && (
            <div
              className="flex items-start gap-2 text-sm px-5 py-2 mx-5 mb-4 rounded-sm"
              style={{ backgroundColor: '#fde7e9', color: '#a4262c', border: '1px solid #f1bbbc' }}
            >
              <span className="shrink-0 mt-0.5 font-bold">!</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer — ADO-style action bar */}
        <div
          className="flex justify-end gap-2 px-5 py-3"
          style={{ backgroundColor: '#f8f8f8', borderTop: '1px solid #edebe9' }}
        >
          <button
            onClick={closeAdoPushModal}
            className="px-4 py-1.5 text-sm rounded-sm transition-colors"
            style={{
              color: '#323130',
              backgroundColor: '#ffffff',
              border: '1px solid #c8c6c4',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f2f1'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
          >
            Cancel
          </button>
          <button
            onClick={handlePush}
            disabled={pushing || !createFormValid}
            className="px-4 py-1.5 text-sm text-white rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            style={{ backgroundColor: '#0078d4' }}
            onMouseEnter={(e) => { if (!pushing && createFormValid) e.currentTarget.style.backgroundColor = '#106ebe'; }}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0078d4'}
          >
            {pushing && <Loader2 className="w-3 h-3 animate-spin" />}
            Create Work Item
          </button>
        </div>
      </div>
    </div>
  );
}
