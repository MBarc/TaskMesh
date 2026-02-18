import { useState, useRef, useEffect } from 'react';
import { Loader2, X, Sparkles } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';

// ServiceNow category -> subcategory mapping
const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  'Inquiry / Help': ['Antivirus', 'Email', 'Internal Application', 'Network', 'Operating System', 'Printing', 'VPN'],
  'Software': ['Email', 'Operating System', 'Office Productivity', 'Application'],
  'Hardware': ['CPU', 'Disk', 'Keyboard', 'Memory', 'Monitor', 'Mouse'],
  'Network': ['DHCP', 'DNS', 'IP Address', 'VPN', 'Wireless'],
  'Database': ['DB2', 'MS SQL Server', 'Oracle'],
};

const CATEGORIES = Object.keys(CATEGORY_SUBCATEGORIES);

const URGENCY_OPTIONS = [
  { value: '1', label: '1 - High' },
  { value: '2', label: '2 - Medium' },
  { value: '3', label: '3 - Low' },
];

const IMPACT_OPTIONS = [
  { value: '1', label: '1 - High' },
  { value: '2', label: '2 - Medium' },
  { value: '3', label: '3 - Low' },
];

const CONTACT_TYPE_OPTIONS = ['Email', 'Phone', 'Self-service', 'Walk-in', 'Virtual Agent', 'Chat'];

function calculatePriority(urgency: string, impact: string): string {
  if (!urgency || !impact) return '';
  const u = parseInt(urgency);
  const i = parseInt(impact);
  if (isNaN(u) || isNaN(i)) return '';
  const sum = u + i;
  if (sum <= 2) return '1 - Critical';
  if (sum <= 3) return '2 - High';
  if (sum <= 4) return '3 - Moderate';
  if (sum <= 5) return '4 - Low';
  return '5 - Planning';
}

export function SnowPushModal() {
  const { snowPushModal, closeSnowPushModal } = useBoardStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Form fields
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [callerId, setCallerId] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [contactType, setContactType] = useState('');
  const [urgency, setUrgency] = useState('');
  const [impact, setImpact] = useState('');
  const [assignmentGroup, setAssignmentGroup] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [configurationItem, setConfigurationItem] = useState('');
  const [comment, setComment] = useState('');

  // State
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [loadingIncident, setLoadingIncident] = useState(false);
  const [isCommentMode, setIsCommentMode] = useState(false);
  const [incidentState, setIncidentState] = useState('');

  // Initialize on open
  useEffect(() => {
    if (!snowPushModal) return;

    setError(null);
    setSuccess(null);
    setPushing(false);
    setGeneratingField(null);
    setGeneratingAll(false);
    setComment('');

    if (snowPushModal.existingSnowSysId) {
      // Comment mode — fetch incident details
      setIsCommentMode(true);
      setLoadingIncident(true);

      api.getSnowIncident(snowPushModal.existingSnowSysId).then((inc) => {
        setShortDescription(inc.shortDescription);
        setDescription(inc.description);
        setCallerId(inc.callerId);
        setCategory(inc.category);
        setSubcategory(inc.subcategory);
        setContactType(inc.contactType);
        setUrgency(inc.urgency);
        setImpact(inc.impact);
        setAssignmentGroup(inc.assignmentGroup);
        setAssignedTo(inc.assignedTo);
        setConfigurationItem(inc.configurationItem);
        setIncidentState(inc.state);
      }).catch((err) => {
        setError(err.message || 'Failed to load incident details');
      }).finally(() => {
        setLoadingIncident(false);
      });
    } else {
      // Create mode
      setIsCommentMode(false);
      setLoadingIncident(false);
      setShortDescription(snowPushModal.taskTitle || '');
      setDescription('');
      setCallerId('');
      setCategory('');
      setSubcategory('');
      setContactType('');
      setUrgency('');
      setImpact('');
      setAssignmentGroup('');
      setConfigurationItem('');
      setIncidentState('');

      // Pre-fill assigned_to from SNOW settings
      api.getSnowSettings().then((settings) => {
        if (settings?.assignedTo) setAssignedTo(settings.assignedTo);
        else setAssignedTo('');
      }).catch(() => setAssignedTo(''));
    }
  }, [snowPushModal]);

  useEffect(() => {
    if (!snowPushModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSnowPushModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [snowPushModal, closeSnowPushModal]);

  if (!snowPushModal) return null;

  const priority = calculatePriority(urgency, impact);
  const subcategories = CATEGORY_SUBCATEGORIES[category] || [];

  const handleGenerateField = async (fieldName: string) => {
    const instructions: Record<string, string> = {
      short_description: 'Write a concise one-line summary for this ServiceNow incident based on the task context. Output ONLY the summary text.',
      description: 'Write a detailed description for this ServiceNow incident based on the task context. Include relevant details, impact, and any steps to reproduce if applicable.',
      comment: 'Write a professional work note / comment for this ServiceNow incident update based on the task context. Be concise and informative.',
    };

    setGeneratingField(fieldName);
    setError(null);
    try {
      const result = await api.generateSnowField({
        taskId: snowPushModal.taskId,
        fieldName,
        aiInstructions: instructions[fieldName] || `Generate content for the ${fieldName} field of a ServiceNow incident.`,
        title: shortDescription || undefined,
      });

      switch (fieldName) {
        case 'short_description':
          setShortDescription(result.content.trim());
          break;
        case 'description':
          setDescription(result.content);
          break;
        case 'comment':
          setComment(result.content);
          break;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate field');
    } finally {
      setGeneratingField(null);
    }
  };

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    setError(null);

    const fields = ['short_description', 'description'];
    const instructions: Record<string, string> = {
      short_description: 'Write a concise one-line summary for this ServiceNow incident based on the task context. Output ONLY the summary text.',
      description: 'Write a detailed description for this ServiceNow incident based on the task context. Include relevant details, impact, and any steps to reproduce if applicable.',
    };

    const promises = fields.map(async (fieldName) => {
      const result = await api.generateSnowField({
        taskId: snowPushModal.taskId,
        fieldName,
        aiInstructions: instructions[fieldName],
        title: shortDescription || undefined,
      });
      return { fieldName, content: result.content };
    });

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { fieldName, content } = result.value;
      if (fieldName === 'short_description') setShortDescription(content.trim());
      if (fieldName === 'description') setDescription(content);
    }

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length === results.length) {
      setError('Failed to generate all fields');
    }

    setGeneratingAll(false);
  };

  const createFormValid =
    shortDescription.trim() &&
    description.trim() &&
    callerId.trim() &&
    category &&
    subcategory &&
    contactType &&
    urgency &&
    impact &&
    assignmentGroup.trim() &&
    assignedTo.trim() &&
    configurationItem.trim();

  const handlePush = async () => {
    if (!shortDescription.trim()) { setError('Short Description is required'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    if (!callerId.trim()) { setError('Caller is required'); return; }
    if (!category) { setError('Category is required'); return; }
    if (!subcategory) { setError('Subcategory is required'); return; }
    if (!contactType) { setError('Contact Type is required'); return; }
    if (!urgency) { setError('Urgency is required'); return; }
    if (!impact) { setError('Impact is required'); return; }
    if (!assignmentGroup.trim()) { setError('Assignment Group is required'); return; }
    if (!assignedTo.trim()) { setError('Assigned To is required'); return; }
    if (!configurationItem.trim()) { setError('Configuration Item is required'); return; }

    setPushing(true);
    setError(null);

    try {
      const updatedTask = await api.pushToSnow({
        taskId: snowPushModal.taskId,
        columnId: snowPushModal.columnId,
        short_description: shortDescription,
        description,
        caller_id: callerId,
        category,
        subcategory,
        urgency,
        impact,
        assignment_group: assignmentGroup,
        assigned_to: assignedTo,
        contact_type: contactType,
        cmdb_ci: configurationItem,
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

      closeSnowPushModal();
    } catch (err: any) {
      setError(err.message || 'Failed to create incident');
    } finally {
      setPushing(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) {
      setError('Comment is required');
      return;
    }

    setPushing(true);
    setError(null);
    setSuccess(null);

    try {
      await api.addSnowComment({
        sysId: snowPushModal.existingSnowSysId!,
        comment,
      });

      // Fetch SNOW settings to build the ticket URL, then persist the cell value
      const settings = await api.getSnowSettings();
      const sysId = snowPushModal.existingSnowSysId!;
      const ticketNumber = snowPushModal.existingTicketNumber!;
      const ticketUrl = settings?.instanceUrl
        ? `${settings.instanceUrl}/incident.do?sys_id=${sysId}`
        : '';
      const cellValue = JSON.stringify({ sysId, ticketNumber, ticketUrl });

      const updatedTask = await api.updateTask(snowPushModal.taskId, {
        [snowPushModal.columnId]: cellValue,
      });

      // Update the task in the store so the table re-renders with the green badge
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

      closeSnowPushModal();
    } catch (err: any) {
      setError(err.message || 'Failed to add comment');
    } finally {
      setPushing(false);
    }
  };

  const inputStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid #bfbfbf',
    color: '#292929',
  };

  const readOnlyInputStyle = {
    backgroundColor: '#f5f5f5',
    border: '1px solid #d9d9d9',
    color: '#6c6c6c',
  };

  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = '#81b532';
      e.currentTarget.style.boxShadow = '0 0 0 1px #81b532';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.currentTarget.style.borderColor = '#bfbfbf';
      e.currentTarget.style.boxShadow = 'none';
    },
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === overlayRef.current) closeSnowPushModal();
      }}
    >
      <div
        className="rounded-sm shadow-2xl w-full max-w-4xl overflow-hidden"
        style={{ fontFamily: '"Source Sans Pro", "Helvetica Neue", Arial, sans-serif' }}
      >
        {/* Green top accent bar */}
        <div className="h-1" style={{ backgroundColor: '#81b532' }} />

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#293e40', borderBottom: '1px solid #1e2e30' }}
        >
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 17.5c-4.14 0-7.5-3.36-7.5-7.5S7.86 4.5 12 4.5s7.5 3.36 7.5 7.5-3.36 7.5-7.5 7.5z"
                fill="#81b532"
              />
              <path
                d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 7.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 9.5 12 9.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                fill="#81b532"
              />
            </svg>
            <h2 className="text-sm font-semibold" style={{ color: '#ffffff' }}>
              {isCommentMode ? `Update ${snowPushModal.existingTicketNumber}` : 'New Incident'}
            </h2>
            <span
              className="text-xs px-1.5 py-0.5 rounded-sm"
              style={{ backgroundColor: 'rgba(129,181,50,0.2)', color: '#a5d353' }}
            >
              ServiceNow
            </span>
          </div>
          <button
            onClick={closeSnowPushModal}
            className="p-1 rounded-sm transition-colors"
            style={{ color: '#98a6a8' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#98a6a8'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Generate All bar (create mode only) */}
        {!isCommentMode && (
          <div
            className="flex justify-end px-5 py-2"
            style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #d9d9d9' }}
          >
            <button
              onClick={handleGenerateAll}
              disabled={generatingAll || generatingField !== null || pushing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
              style={{ backgroundColor: '#81b532' }}
              onMouseEnter={(e) => { if (!generatingAll) e.currentTarget.style.backgroundColor = '#6d9a2a'; }}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#81b532'}
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
        )}

        {/* Content */}
        <div
          className="max-h-[70vh] overflow-y-auto"
          style={{ backgroundColor: '#ffffff' }}
        >
          {loadingIncident ? (
            <div className="flex items-center justify-center gap-2 py-16" style={{ color: '#6c6c6c' }}>
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#81b532' }} />
              Loading incident details...
            </div>
          ) : (
            <div className="flex">
              {/* Left column — Short Description + Description (or Comment in comment mode) */}
              <div className="flex-1 min-w-0 px-5 py-4 space-y-4" style={{ borderRight: '1px solid #d9d9d9' }}>
                {/* Short Description */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="block text-xs font-semibold" style={{ color: '#6c6c6c' }}>
                      Short Description {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                    </label>
                    {!isCommentMode && (
                      <button
                        onClick={() => handleGenerateField('short_description')}
                        disabled={generatingField === 'short_description' || pushing || generatingAll}
                        className="p-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        style={{ color: '#81b532' }}
                        title="Generate with AI"
                      >
                        {generatingField === 'short_description' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Enter short description..."
                    readOnly={isCommentMode}
                    className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none"
                    style={isCommentMode ? readOnlyInputStyle : inputStyle}
                    {...(!isCommentMode ? focusHandlers : {})}
                  />
                </div>

                {/* Description */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="block text-xs font-semibold" style={{ color: '#6c6c6c' }}>
                      Description {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                    </label>
                    {!isCommentMode && (
                      <button
                        onClick={() => handleGenerateField('description')}
                        disabled={generatingField === 'description' || pushing || generatingAll}
                        className="p-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        style={{ color: '#81b532' }}
                        title="Generate with AI"
                      >
                        {generatingField === 'description' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={isCommentMode ? 3 : 5}
                    placeholder="Enter description..."
                    readOnly={isCommentMode}
                    className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none resize-y"
                    style={isCommentMode ? readOnlyInputStyle : inputStyle}
                    {...(!isCommentMode ? focusHandlers : {})}
                  />
                </div>

                {/* Comment (comment mode only) */}
                {isCommentMode && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <label className="block text-xs font-semibold" style={{ color: '#6c6c6c' }}>
                        Add Comment <span style={{ color: '#d1352a' }}>*</span>
                      </label>
                      <button
                        onClick={() => handleGenerateField('comment')}
                        disabled={generatingField === 'comment' || pushing}
                        className="p-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        style={{ color: '#81b532' }}
                        title="Generate with AI"
                      >
                        {generatingField === 'comment' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={5}
                      placeholder="Enter comment..."
                      className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none resize-y"
                      style={inputStyle}
                      {...focusHandlers}
                    />
                  </div>
                )}
              </div>

              {/* Right column — metadata */}
              <div className="w-72 shrink-0 px-4 py-4 space-y-3" style={{ backgroundColor: '#fafafa' }}>
                {/* State (comment mode only) */}
                {isCommentMode && incidentState && (
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                      State
                    </label>
                    <input
                      type="text"
                      value={incidentState}
                      readOnly
                      className="w-full px-3 py-2 text-sm rounded-sm"
                      style={readOnlyInputStyle}
                    />
                  </div>
                )}

                {/* Caller */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Caller {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  <input
                    type="text"
                    value={callerId}
                    onChange={(e) => setCallerId(e.target.value)}
                    placeholder="Caller ID..."
                    readOnly={isCommentMode}
                    className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none"
                    style={isCommentMode ? readOnlyInputStyle : inputStyle}
                    {...(!isCommentMode ? focusHandlers : {})}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Category {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  {isCommentMode ? (
                    <input type="text" value={category} readOnly className="w-full px-3 py-2 text-sm rounded-sm" style={readOnlyInputStyle} />
                  ) : (
                    <select
                      value={category}
                      onChange={(e) => { setCategory(e.target.value); setSubcategory(''); }}
                      className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none appearance-none"
                      style={inputStyle}
                      {...focusHandlers}
                    >
                      <option value="">-- None --</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Subcategory */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Subcategory {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  {isCommentMode ? (
                    <input type="text" value={subcategory} readOnly className="w-full px-3 py-2 text-sm rounded-sm" style={readOnlyInputStyle} />
                  ) : (
                    <select
                      value={subcategory}
                      onChange={(e) => setSubcategory(e.target.value)}
                      disabled={!category}
                      className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none appearance-none disabled:opacity-50"
                      style={inputStyle}
                      {...focusHandlers}
                    >
                      <option value="">-- None --</option>
                      {subcategories.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Contact Type */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Contact Type {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  {isCommentMode ? (
                    <input type="text" value={contactType} readOnly className="w-full px-3 py-2 text-sm rounded-sm" style={readOnlyInputStyle} />
                  ) : (
                    <select
                      value={contactType}
                      onChange={(e) => setContactType(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none appearance-none"
                      style={inputStyle}
                      {...focusHandlers}
                    >
                      <option value="">-- None --</option>
                      {CONTACT_TYPE_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Urgency */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Urgency {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  {isCommentMode ? (
                    <input type="text" value={urgency} readOnly className="w-full px-3 py-2 text-sm rounded-sm" style={readOnlyInputStyle} />
                  ) : (
                    <select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none appearance-none"
                      style={inputStyle}
                      {...focusHandlers}
                    >
                      <option value="">-- None --</option>
                      {URGENCY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Impact */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Impact {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  {isCommentMode ? (
                    <input type="text" value={impact} readOnly className="w-full px-3 py-2 text-sm rounded-sm" style={readOnlyInputStyle} />
                  ) : (
                    <select
                      value={impact}
                      onChange={(e) => setImpact(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none appearance-none"
                      style={inputStyle}
                      {...focusHandlers}
                    >
                      <option value="">-- None --</option>
                      {IMPACT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Priority (auto-calculated) */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Priority
                  </label>
                  <input
                    type="text"
                    value={isCommentMode ? (urgency && impact ? calculatePriority(urgency.charAt(0), impact.charAt(0)) : '') : priority}
                    readOnly
                    className="w-full px-3 py-2 text-sm rounded-sm"
                    style={readOnlyInputStyle}
                    placeholder="Auto-calculated"
                  />
                </div>

                {/* Assignment Group */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Assignment Group {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  <input
                    type="text"
                    value={assignmentGroup}
                    onChange={(e) => setAssignmentGroup(e.target.value)}
                    placeholder="Assignment group..."
                    readOnly={isCommentMode}
                    className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none"
                    style={isCommentMode ? readOnlyInputStyle : inputStyle}
                    {...(!isCommentMode ? focusHandlers : {})}
                  />
                </div>

                {/* Assigned To */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Assigned To {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="Assigned to..."
                    readOnly={isCommentMode}
                    className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none"
                    style={isCommentMode ? readOnlyInputStyle : inputStyle}
                    {...(!isCommentMode ? focusHandlers : {})}
                  />
                </div>

                {/* Configuration Item */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: '#6c6c6c' }}>
                    Configuration Item {!isCommentMode && <span style={{ color: '#d1352a' }}>*</span>}
                  </label>
                  <input
                    type="text"
                    value={configurationItem}
                    onChange={(e) => setConfigurationItem(e.target.value)}
                    placeholder="CI..."
                    readOnly={isCommentMode}
                    className="w-full px-3 py-2 text-sm rounded-sm focus:outline-none"
                    style={isCommentMode ? readOnlyInputStyle : inputStyle}
                    {...(!isCommentMode ? focusHandlers : {})}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2 text-sm px-5 py-2.5 mx-5 mb-3 rounded-sm"
              style={{ backgroundColor: '#fff0ee', color: '#d1352a', border: '1px solid #fcc4bf' }}
            >
              <span className="shrink-0 mt-0.5 font-bold">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div
              className="flex items-start gap-2 text-sm px-5 py-2.5 mx-5 mb-3 rounded-sm"
              style={{ backgroundColor: '#e8f5e0', color: '#2b6e1a', border: '1px solid #b8dfa8' }}
            >
              <span className="shrink-0 mt-0.5 font-bold">&#10003;</span>
              <span>{success}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-5 py-3"
          style={{ backgroundColor: '#f1f1f1', borderTop: '1px solid #d9d9d9' }}
        >
          <button
            onClick={closeSnowPushModal}
            className="px-4 py-1.5 text-sm rounded-sm transition-colors"
            style={{
              color: '#292929',
              backgroundColor: '#ffffff',
              border: '1px solid #bfbfbf',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e8e8e8'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={isCommentMode ? handleAddComment : handlePush}
            disabled={pushing || (isCommentMode ? !comment.trim() : !createFormValid)}
            className="px-4 py-1.5 text-sm text-white rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            style={{ backgroundColor: '#81b532' }}
            onMouseEnter={(e) => {
              if (!pushing) e.currentTarget.style.backgroundColor = '#6d9a2a';
            }}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#81b532'}
          >
            {pushing && <Loader2 className="w-3 h-3 animate-spin" />}
            {isCommentMode ? 'Add Comment' : 'Create Incident'}
          </button>
        </div>
      </div>
    </div>
  );
}
