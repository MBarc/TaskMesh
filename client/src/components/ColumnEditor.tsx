import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Plug, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { ColumnAlignment } from '../types';
import { useBoardStore } from '../stores/boardStore';
import { getEmailSettings, getAdoSettings, getSnowSettings } from '../api';
import type { ColumnType, Column } from '../types';

const CONNECTOR_TYPES = new Set(['ADO_PUSH', 'ITEM_NO', 'SNOW_PUSH', 'EMAIL']);
// Types that are server-managed (no name field, use ensure/remove endpoints)
const MANAGED_TYPES = new Set(['ADO_PUSH', 'ITEM_NO', 'SNOW_PUSH', 'EMAIL', 'DOCUMENTATION']);

const CONNECTOR_REMOVE_MAP: Partial<Record<ColumnType, string>> = {
  ADO_PUSH: 'ado',
  ITEM_NO: 'item-no',
  SNOW_PUSH: 'snow-push',
  EMAIL: 'email',
  DOCUMENTATION: 'documentation',
};

interface ColumnEditorProps {
  onClose: () => void;
}

const STANDARD_TYPES: { value: ColumnType; label: string; description: string }[] = [
  { value: 'TEXT', label: 'Text', description: 'Single line text' },
  { value: 'NUMBER', label: 'Number', description: 'Numeric values' },
  { value: 'DATE', label: 'Date', description: 'Date picker' },
  { value: 'CHECKBOX', label: 'Checkbox', description: 'True/false toggle' },
  { value: 'DROPDOWN', label: 'Dropdown', description: 'Single select from options' },
  { value: 'MULTI_SELECT', label: 'Multi-select', description: 'Multiple selections' },
  { value: 'DOCUMENTATION', label: 'Wiki', description: 'Attach Markdown documents to tasks' },
];

const INTEGRATION_TYPES: { value: ColumnType; label: string; description: string; connector: 'ado' | 'snow' | 'email' | 'ado_or_snow' }[] = [
  { value: 'ADO_PUSH', label: 'ADO Push', description: 'Push tasks to Azure DevOps as work items', connector: 'ado' },
  { value: 'ITEM_NO', label: 'Item No.', description: 'ITSM item number managed by connectors', connector: 'ado_or_snow' },
  { value: 'SNOW_PUSH', label: 'SNOW Push', description: 'Push tasks to ServiceNow as incidents', connector: 'snow' },
  { value: 'EMAIL', label: 'Email', description: 'Import tasks from email and send replies', connector: 'email' },
];

const TYPE_LABELS: Partial<Record<ColumnType, string>> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  DATE: 'Date',
  CHECKBOX: 'Checkbox',
  DROPDOWN: 'Dropdown',
  MULTI_SELECT: 'Multi-select',
  SOURCE: 'Source',
  ADO_PUSH: 'ADO Push',
  ITEM_NO: 'Item No.',
  SNOW_PUSH: 'SNOW Push',
  EMAIL: 'Email',
  DOCUMENTATION: 'Wiki',
};

export function ColumnEditor({ onClose }: ColumnEditorProps) {
  const {
    currentBoard, addColumn, updateColumn, deleteColumn, reorderColumns,
    ensureAdoColumn, removeAdoColumn,
    ensureItemNoColumn, removeItemNoColumn,
    ensureSnowPushColumn, removeSnowPushColumn,
    ensureEmailColumn, removeEmailColumn,
    ensureDocumentationColumn, removeDocumentationColumn,
  } = useBoardStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('TEXT');
  const [newColumnOptions, setNewColumnOptions] = useState<{ value: string; color?: string }[]>([]);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const [adoConfigured, setAdoConfigured] = useState(false);
  const [snowConfigured, setSnowConfigured] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);

  useEffect(() => {
    async function loadConnectorSettings() {
      const [ado, snow, outlook, gmail] = await Promise.all([
        getAdoSettings().catch(() => null),
        getSnowSettings().catch(() => null),
        getEmailSettings('outlook').catch(() => null),
        getEmailSettings('gmail').catch(() => null),
      ]);
      setAdoConfigured(!!ado);
      setSnowConfigured(!!snow);
      setEmailConfigured(!!(outlook || gmail));
    }
    loadConnectorSettings();
  }, []);

  const availableIntegrationTypes = INTEGRATION_TYPES.filter(({ connector }) => {
    if (connector === 'ado') return adoConfigured;
    if (connector === 'snow') return snowConfigured;
    if (connector === 'email') return emailConfigured;
    if (connector === 'ado_or_snow') return adoConfigured || snowConfigured;
    return false;
  });

  const hasIntegrations = availableIntegrationTypes.length > 0;
  const isConnectorType = (type: ColumnType) => CONNECTOR_TYPES.has(type);
  const needsOptions = (type: ColumnType) => type === 'DROPDOWN' || type === 'MULTI_SELECT';
  const isManagedTypeSelected = MANAGED_TYPES.has(newColumnType);

  // Drag state
  const dragColIndex = useRef<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);
  const [isDraggingCol, setIsDraggingCol] = useState(false);

  const columns = currentBoard?.columns || [];

  // Already-added managed types (prevent duplicates in the add form)
  const addedManagedTypes = new Set(columns.filter((c) => MANAGED_TYPES.has(c.type)).map((c) => c.type));
  const addableStandardTypes = STANDARD_TYPES.filter((t) => !addedManagedTypes.has(t.value));
  const addableIntegrationTypes = availableIntegrationTypes.filter((t) => !addedManagedTypes.has(t.value));

  const handleColDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragColIndex.current = index;
    setIsDraggingCol(true);
    e.dataTransfer.effectAllowed = 'move';
    const ghost = document.createElement('div');
    ghost.style.opacity = '0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }, []);

  const handleColDragEnd = useCallback(() => {
    dragColIndex.current = null;
    setIsDraggingCol(false);
    setDragOverColIndex(null);
  }, []);

  const handleColDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverColIndex(index);
  }, []);

  const handleColDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragColIndex.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverColIndex(null);
      setIsDraggingCol(false);
      return;
    }
    const reordered = [...columns];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    reorderColumns(reordered.map((c) => c.id));
    dragColIndex.current = null;
    setIsDraggingCol(false);
    setDragOverColIndex(null);
  }, [columns, reorderColumns]);

  const handleAddColumn = async () => {
    setAddError(null);

    if (isManagedTypeSelected) {
      switch (newColumnType) {
        case 'ADO_PUSH': await ensureAdoColumn(); break;
        case 'ITEM_NO': await ensureItemNoColumn(); break;
        case 'SNOW_PUSH': await ensureSnowPushColumn(); break;
        case 'EMAIL': await ensureEmailColumn(); break;
        case 'DOCUMENTATION': await ensureDocumentationColumn(); break;
      }
    } else {
      if (!newColumnName.trim()) return;
      await addColumn(
        newColumnName.trim(),
        newColumnType,
        needsOptions(newColumnType) ? newColumnOptions : undefined,
      );
    }

    resetAddForm();
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewColumnName('');
    setNewColumnType('TEXT');
    setNewColumnOptions([]);
    setAddError(null);
  };

  const handleDeleteColumn = async (column: Column) => {
    const removeKey = CONNECTOR_REMOVE_MAP[column.type];
    if (removeKey) {
      const confirmed = confirm(`Remove the ${TYPE_LABELS[column.type] ?? column.name} column? This will remove all associated data.`);
      if (!confirmed) return;
      switch (column.type) {
        case 'ADO_PUSH': await removeAdoColumn(); break;
        case 'ITEM_NO': await removeItemNoColumn(); break;
        case 'SNOW_PUSH': await removeSnowPushColumn(); break;
        case 'EMAIL': await removeEmailColumn(); break;
        case 'DOCUMENTATION': await removeDocumentationColumn(); break;
      }
    } else {
      if (confirm('Are you sure you want to delete this column? All data in this column will be lost.')) {
        await deleteColumn(column.id);
      }
    }
  };

  const handleUpdateColumn = async () => {
    if (!editingColumn || !editingColumn.name.trim()) return;
    await updateColumn(
      editingColumn.id,
      editingColumn.name,
      needsOptions(editingColumn.type)
        ? editingColumn.options.map((o) => ({ id: o.id.startsWith('temp-') ? undefined : o.id, value: o.value, color: o.color }))
        : undefined,
      undefined,
      editingColumn.alignment,
    );
    setEditingColumn(null);
  };

  const addOption = (isNew: boolean) => {
    const defaultColor = '#6366f1';
    if (isNew) {
      setNewColumnOptions([...newColumnOptions, { value: '', color: defaultColor }]);
    } else if (editingColumn) {
      setEditingColumn({
        ...editingColumn,
        options: [...editingColumn.options, { id: `temp-${Date.now()}`, columnId: editingColumn.id, value: '', color: defaultColor, order: editingColumn.options.length }],
      });
    }
  };

  const updateOption = (isNew: boolean, index: number, value: string, color?: string) => {
    if (isNew) {
      const updated = [...newColumnOptions];
      updated[index] = { value, color };
      setNewColumnOptions(updated);
    } else if (editingColumn) {
      const updated = [...editingColumn.options];
      updated[index] = { ...updated[index], value, color };
      setEditingColumn({ ...editingColumn, options: updated });
    }
  };

  const removeOption = (isNew: boolean, index: number) => {
    if (isNew) {
      setNewColumnOptions(newColumnOptions.filter((_, i) => i !== index));
    } else if (editingColumn) {
      setEditingColumn({ ...editingColumn, options: editingColumn.options.filter((_, i) => i !== index) });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Edit Columns</h2>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-surface-tertiary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Column list */}
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-border">
            {columns.map((column, index) => {
              const isConnector = isConnectorType(column.type);
              const isBeingDragged = isDraggingCol && dragColIndex.current === index;
              const isOver = isDraggingCol && dragOverColIndex === index && dragColIndex.current !== index;
              const dropAbove = isOver && dragColIndex.current !== null && dragColIndex.current > index;
              const dropBelow = isOver && dragColIndex.current !== null && dragColIndex.current < index;
              const typeLabel = TYPE_LABELS[column.type] ?? column.type;

              return (
                <div
                  key={column.id}
                  draggable
                  onDragStart={(e) => handleColDragStart(e, index)}
                  onDragEnd={handleColDragEnd}
                  onDragOver={(e) => handleColDragOver(e, index)}
                  onDrop={(e) => handleColDrop(e, index)}
                  className="bg-surface transition-opacity"
                  style={{
                    opacity: isBeingDragged ? 0.4 : 1,
                    borderTop: dropAbove ? '2px solid var(--color-primary-500, #6366f1)' : undefined,
                    borderBottom: dropBelow ? '2px solid var(--color-primary-500, #6366f1)' : undefined,
                  }}
                >
                  {editingColumn?.id === column.id ? (
                    /* ── Inline edit form ── */
                    <div className="px-4 py-3 space-y-3">
                      <input
                        type="text"
                        value={editingColumn.name}
                        onChange={(e) => setEditingColumn({ ...editingColumn, name: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
                        autoFocus
                      />
                      <div>
                        <div className="text-xs font-medium text-text-secondary mb-1.5">Alignment</div>
                        <div className="flex gap-1">
                          {([['auto', 'Auto'], ['left', null], ['center', null], ['right', null]] as [ColumnAlignment, string | null][]).map(([val, label]) => {
                            const isActive = (editingColumn.alignment ?? 'auto') === val;
                            const Icon = val === 'left' ? AlignLeft : val === 'center' ? AlignCenter : val === 'right' ? AlignRight : null;
                            return (
                              <button
                                key={val}
                                onClick={() => setEditingColumn({ ...editingColumn, alignment: val })}
                                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors ${isActive ? 'bg-primary-500 text-white border-primary-500' : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-text-muted'}`}
                              >
                                {Icon && <Icon className="w-3.5 h-3.5" />}
                                {label ?? val.charAt(0).toUpperCase() + val.slice(1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {needsOptions(editingColumn.type) && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-text-secondary">Options</div>
                          {editingColumn.options.map((option, idx) => (
                            <div key={option.id} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={option.value}
                                onChange={(e) => updateOption(false, idx, e.target.value, option.color)}
                                placeholder="Option value"
                                className="flex-1 px-2 py-1 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
                              />
                              <input
                                type="color"
                                value={option.color || '#6366f1'}
                                onChange={(e) => updateOption(false, idx, option.value, e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer"
                              />
                              <button onClick={() => removeOption(false, idx)} className="p-1 text-text-muted hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => addOption(false)} className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600">
                            <Plus className="w-4 h-4" />Add option
                          </button>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingColumn(null)} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">Cancel</button>
                        <button onClick={handleUpdateColumn} className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded hover:bg-primary-600">Save</button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal row ── */
                    <div className="flex items-center gap-3 px-4 py-3">
                      <GripVertical className="w-4 h-4 text-text-muted cursor-grab shrink-0" />
                      <span className="flex-1 text-sm font-medium text-text-primary truncate">{column.name}</span>
                      {isConnector && (
                        <span className="flex items-center gap-1 text-xs text-primary-500 bg-primary-500/10 px-2 py-0.5 rounded-full shrink-0">
                          <Plug className="w-3 h-3" />{typeLabel}
                        </span>
                      )}
                      {!isConnector && (
                        <span className="text-xs text-text-muted bg-surface-tertiary border border-border px-2 py-0.5 rounded-full shrink-0">
                          {typeLabel}
                        </span>
                      )}
                      <button
                        onClick={() => setEditingColumn({ ...column, options: column.options.map((o) => ({ ...o, color: o.color || '#6366f1' })) })}
                        className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded shrink-0"
                      >
                        Edit
                      </button>
                      <button onClick={() => handleDeleteColumn(column)} className="p-1 text-text-muted hover:text-red-500 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Column Form / Button */}
          <div className="p-4">
            {showAddForm ? (
              <div className="rounded-lg border border-border p-4 space-y-3 bg-surface">
                {/* Type selector first so the name field can conditionally hide */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Type</label>
                  <select
                    value={newColumnType}
                    onChange={(e) => { setNewColumnType(e.target.value as ColumnType); setNewColumnOptions([]); setAddError(null); }}
                    className="w-full px-3 py-2 bg-surface-tertiary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary text-sm"
                  >
                    <optgroup label="Standard">
                      {addableStandardTypes.map((t) => (
                        <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
                      ))}
                    </optgroup>
                    {hasIntegrations && addableIntegrationTypes.length > 0 && (
                      <optgroup label="Integration Columns">
                        {addableIntegrationTypes.map((t) => (
                          <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* Name field — hidden for managed types (server sets the name) */}
                {!isManagedTypeSelected && (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
                    <input
                      type="text"
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      placeholder="Column name"
                      className="w-full px-3 py-2 bg-surface-tertiary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary text-sm"
                      autoFocus
                    />
                  </div>
                )}

                {/* Managed type note */}
                {isManagedTypeSelected && (
                  <p className="text-xs text-text-muted">
                    This column is managed by TaskMesh. Its content is populated automatically.
                  </p>
                )}

                {/* Options editor for dropdown/multi-select */}
                {needsOptions(newColumnType) && (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">Options</label>
                    <div className="space-y-2">
                      {newColumnOptions.map((option, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={option.value}
                            onChange={(e) => updateOption(true, idx, e.target.value, option.color)}
                            placeholder="Option value"
                            className="flex-1 px-2 py-1 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
                          />
                          <input
                            type="color"
                            value={option.color || '#6366f1'}
                            onChange={(e) => updateOption(true, idx, option.value, e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          <button onClick={() => removeOption(true, idx)} className="p-1 text-text-muted hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addOption(true)} className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600">
                        <Plus className="w-4 h-4" />Add option
                      </button>
                    </div>
                  </div>
                )}

                {addError && <p className="text-xs text-red-600">{addError}</p>}

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={resetAddForm} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
                    Cancel
                  </button>
                  <button
                    onClick={handleAddColumn}
                    disabled={!isManagedTypeSelected && !newColumnName.trim()}
                    className="px-4 py-2 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add Column
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg border border-dashed border-border"
              >
                <Plus className="w-4 h-4" />
                Add Column
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600">
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
