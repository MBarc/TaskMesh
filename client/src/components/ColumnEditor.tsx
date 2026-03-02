import { useState, useRef, useCallback } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import { getEmailSettings, getDocumentationSettings } from '../api';
import type { ColumnType, Column } from '../types';

const AUTO_MANAGED_TYPES = new Set(['ADO_PUSH', 'ITEM_NO', 'SNOW_PUSH', 'EMAIL', 'SOURCE', 'DOCUMENTATION']);

interface ColumnEditorProps {
  onClose: () => void;
}

const columnTypes: { value: ColumnType; label: string; description: string }[] = [
  { value: 'TEXT', label: 'Text', description: 'Single line text' },
  { value: 'NUMBER', label: 'Number', description: 'Numeric values' },
  { value: 'DATE', label: 'Date', description: 'Date picker' },
  { value: 'CHECKBOX', label: 'Checkbox', description: 'True/false toggle' },
  { value: 'DROPDOWN', label: 'Dropdown', description: 'Single select from options' },
  { value: 'MULTI_SELECT', label: 'Multi-select', description: 'Multiple selections' },
  { value: 'SOURCE', label: 'Source', description: 'Meeting platform source (auto-managed)' },
  { value: 'ADO_PUSH', label: 'ADO Push', description: 'Azure DevOps work item link (auto-managed)' },
  { value: 'ITEM_NO', label: 'Item No.', description: 'ITSM item number (auto-managed)' },
  { value: 'SNOW_PUSH', label: 'SNOW Push', description: 'Push tasks to ServiceNow as incidents (auto-managed)' },
];

const addableColumnTypes = columnTypes.filter(
  (t) => t.value !== 'SOURCE' && t.value !== 'ADO_PUSH' && t.value !== 'ITEM_NO' && t.value !== 'SNOW_PUSH'
);

export function ColumnEditor({ onClose }: ColumnEditorProps) {
  const { currentBoard, addColumn, updateColumn, deleteColumn, reorderColumns, ensureAdoColumn, removeAdoColumn, ensureItemNoColumn, removeItemNoColumn, ensureSnowPushColumn, removeSnowPushColumn, ensureEmailColumn, removeEmailColumn, ensureDocumentationColumn, removeDocumentationColumn } = useBoardStore();
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('TEXT');
  const [newColumnOptions, setNewColumnOptions] = useState<{ value: string; color?: string }[]>([]);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [documentationError, setDocumentationError] = useState<string | null>(null);

  // Column drag-and-drop state
  const dragColIndex = useRef<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);
  const [isDraggingCol, setIsDraggingCol] = useState(false);

  const columns = currentBoard?.columns || [];
  const adoEnabled = columns.some((c) => c.type === 'ADO_PUSH');
  const itemNoEnabled = columns.some((c) => c.type === 'ITEM_NO');
  const snowPushEnabled = columns.some((c) => c.type === 'SNOW_PUSH');
  const emailEnabled = columns.some((c) => c.type === 'EMAIL');
  const documentationEnabled = columns.some((c) => c.type === 'DOCUMENTATION');

  const handleColDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragColIndex.current = index;
    setIsDraggingCol(true);
    e.dataTransfer.effectAllowed = 'move';
    const dragImage = document.createElement('div');
    dragImage.style.opacity = '0';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(dragImage));
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

  const handleToggleAdo = async () => {
    if (adoEnabled) {
      await removeAdoColumn();
    } else {
      await ensureAdoColumn();
    }
  };

  const handleToggleItemNo = async () => {
    if (itemNoEnabled) {
      await removeItemNoColumn();
    } else {
      await ensureItemNoColumn();
    }
  };

  const handleToggleSnowPush = async () => {
    if (snowPushEnabled) {
      await removeSnowPushColumn();
    } else {
      await ensureSnowPushColumn();
    }
  };

  const handleToggleEmail = async () => {
    if (emailEnabled) {
      setEmailError(null);
      await removeEmailColumn();
    } else {
      // Check if any email connector is configured before enabling
      const [outlook, gmail] = await Promise.all([
        getEmailSettings('outlook').catch(() => null),
        getEmailSettings('gmail').catch(() => null),
      ]);

      if (!outlook && !gmail) {
        setEmailError('No email connector configured. Please set up an Outlook or Gmail connector in Settings first.');
        return;
      }

      setEmailError(null);
      await ensureEmailColumn();
    }
  };

  const handleToggleDocumentation = async () => {
    if (documentationEnabled) {
      setDocumentationError(null);
      await removeDocumentationColumn();
    } else {
      const settings = await getDocumentationSettings().catch(() => null);
      if (!settings) {
        setDocumentationError('Could not reach the documentation service. Please check that the server is running.');
        return;
      }
      setDocumentationError(null);
      await ensureDocumentationColumn();
    }
  };

  const handleToggleRequired = async (columnType: ColumnType, currentValue: boolean) => {
    const col = columns.find((c) => c.type === columnType);
    if (!col) return;
    await updateColumn(col.id, col.name, undefined, !currentValue);
  };

  const needsOptions = (type: ColumnType) => type === 'DROPDOWN' || type === 'MULTI_SELECT';

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;

    await addColumn(
      newColumnName.trim(),
      newColumnType,
      needsOptions(newColumnType) ? newColumnOptions : undefined
    );

    setNewColumnName('');
    setNewColumnType('TEXT');
    setNewColumnOptions([]);
    setShowAddColumn(false);
  };

  const handleUpdateColumn = async () => {
    if (!editingColumn || !editingColumn.name.trim()) return;

    await updateColumn(
      editingColumn.id,
      editingColumn.name,
      needsOptions(editingColumn.type)
        ? editingColumn.options.map((o) => ({ value: o.value, color: o.color }))
        : undefined
    );

    setEditingColumn(null);
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (confirm('Are you sure you want to delete this column? All data in this column will be lost.')) {
      await deleteColumn(columnId);
    }
  };

  const addOption = (isNew: boolean) => {
    const defaultColor = '#6366f1';
    if (isNew) {
      setNewColumnOptions([...newColumnOptions, { value: '', color: defaultColor }]);
    } else if (editingColumn) {
      setEditingColumn({
        ...editingColumn,
        options: [
          ...editingColumn.options,
          { id: `temp-${Date.now()}`, columnId: editingColumn.id, value: '', color: defaultColor, order: editingColumn.options.length },
        ],
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
      setEditingColumn({
        ...editingColumn,
        options: editingColumn.options.filter((_, i) => i !== index),
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Edit Columns</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-surface-tertiary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          {/* Column header labels for toggles */}
          <div className="flex justify-end gap-3 px-3 mb-1">
            <span className="text-xs font-medium text-text-muted w-11 text-center">Enabled</span>
            <span className="text-xs font-medium text-text-muted w-11 text-center">Required</span>
          </div>

          {/* ADO Toggle */}
          <div className="mb-2">
            <div className="flex items-center justify-between p-3 bg-surface-tertiary rounded-lg border border-border">
              <div className="min-w-0">
                <div className="font-medium text-text-primary text-sm">ADO Push</div>
                <div className="text-xs text-text-muted">Push tasks to Azure DevOps as work items</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleToggleAdo}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    adoEnabled ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      adoEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <button
                  onClick={() => adoEnabled && handleToggleRequired('ADO_PUSH', columns.find((c) => c.type === 'ADO_PUSH')?.requiredForCompletion ?? false)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    !adoEnabled ? 'bg-gray-200 opacity-40 cursor-not-allowed' : columns.find((c) => c.type === 'ADO_PUSH')?.requiredForCompletion ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                  disabled={!adoEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      adoEnabled && columns.find((c) => c.type === 'ADO_PUSH')?.requiredForCompletion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Item No. Toggle */}
          <div className="mb-2">
            <div className="flex items-center justify-between p-3 bg-surface-tertiary rounded-lg border border-border">
              <div className="min-w-0">
                <div className="font-medium text-text-primary text-sm">Item No.</div>
                <div className="text-xs text-text-muted">ITSM item number column (managed by ITSM connectors)</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleToggleItemNo}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    itemNoEnabled ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      itemNoEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <button
                  onClick={() => itemNoEnabled && handleToggleRequired('ITEM_NO', columns.find((c) => c.type === 'ITEM_NO')?.requiredForCompletion ?? false)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    !itemNoEnabled ? 'bg-gray-200 opacity-40 cursor-not-allowed' : columns.find((c) => c.type === 'ITEM_NO')?.requiredForCompletion ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                  disabled={!itemNoEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      itemNoEnabled && columns.find((c) => c.type === 'ITEM_NO')?.requiredForCompletion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* SNOW Push Toggle */}
          <div className="mb-2">
            <div className="flex items-center justify-between p-3 bg-surface-tertiary rounded-lg border border-border">
              <div className="min-w-0">
                <div className="font-medium text-text-primary text-sm">SNOW Push</div>
                <div className="text-xs text-text-muted">Push tasks to ServiceNow as new incidents</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleToggleSnowPush}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    snowPushEnabled ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      snowPushEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <button
                  onClick={() => snowPushEnabled && handleToggleRequired('SNOW_PUSH', columns.find((c) => c.type === 'SNOW_PUSH')?.requiredForCompletion ?? false)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    !snowPushEnabled ? 'bg-gray-200 opacity-40 cursor-not-allowed' : columns.find((c) => c.type === 'SNOW_PUSH')?.requiredForCompletion ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                  disabled={!snowPushEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      snowPushEnabled && columns.find((c) => c.type === 'SNOW_PUSH')?.requiredForCompletion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Email Toggle */}
          <div className="mb-2">
            <div className="flex items-center justify-between p-3 bg-surface-tertiary rounded-lg border border-border">
              <div className="min-w-0">
                <div className="font-medium text-text-primary text-sm">Email</div>
                <div className="text-xs text-text-muted">Import tasks from email and send replies</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleToggleEmail}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    emailEnabled ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      emailEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <button
                  onClick={() => emailEnabled && handleToggleRequired('EMAIL', columns.find((c) => c.type === 'EMAIL')?.requiredForCompletion ?? false)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    !emailEnabled ? 'bg-gray-200 opacity-40 cursor-not-allowed' : columns.find((c) => c.type === 'EMAIL')?.requiredForCompletion ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                  disabled={!emailEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      emailEnabled && columns.find((c) => c.type === 'EMAIL')?.requiredForCompletion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            {emailError && (
              <div className="mt-1 px-3 py-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md">
                {emailError}
              </div>
            )}
          </div>

          {/* Documentation Toggle */}
          <div className="mb-4">
            <div className="flex items-center justify-between p-3 bg-surface-tertiary rounded-lg border border-border">
              <div className="min-w-0">
                <div className="font-medium text-text-primary text-sm">Documentation</div>
                <div className="text-xs text-text-muted">Generate and save Markdown documentation</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleToggleDocumentation}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    documentationEnabled ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      documentationEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <button
                  onClick={() => documentationEnabled && handleToggleRequired('DOCUMENTATION', columns.find((c) => c.type === 'DOCUMENTATION')?.requiredForCompletion ?? false)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    !documentationEnabled ? 'bg-gray-200 opacity-40 cursor-not-allowed' : columns.find((c) => c.type === 'DOCUMENTATION')?.requiredForCompletion ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                  disabled={!documentationEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      documentationEnabled && columns.find((c) => c.type === 'DOCUMENTATION')?.requiredForCompletion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            {documentationError && (
              <div className="mt-1 px-3 py-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md">
                {documentationError}
              </div>
            )}
          </div>

          {/* Existing Columns */}
          <div className="space-y-2 mb-4">
            {columns.map((column, index) => {
              const isAutoManaged = AUTO_MANAGED_TYPES.has(column.type);
              const isBeingDragged = isDraggingCol && dragColIndex.current === index;
              const isOver = isDraggingCol && dragOverColIndex === index && dragColIndex.current !== index;
              const dropAbove = isOver && dragColIndex.current !== null && dragColIndex.current > index;
              const dropBelow = isOver && dragColIndex.current !== null && dragColIndex.current < index;

              return (
                <div
                  key={column.id}
                  draggable
                  onDragStart={(e) => handleColDragStart(e, index)}
                  onDragEnd={handleColDragEnd}
                  onDragOver={(e) => handleColDragOver(e, index)}
                  onDrop={(e) => handleColDrop(e, index)}
                  className="flex items-center gap-2 p-3 rounded-lg border transition-all bg-surface-secondary border-border"
                  style={{
                    opacity: isBeingDragged ? 0.4 : 1,
                    borderTopWidth: dropAbove ? '2px' : '1px',
                    borderBottomWidth: dropBelow ? '2px' : '1px',
                    borderTopColor: dropAbove ? 'var(--color-primary-500, #6366f1)' : undefined,
                    borderBottomColor: dropBelow ? 'var(--color-primary-500, #6366f1)' : undefined,
                  }}
                >
                  <GripVertical className="w-4 h-4 text-text-muted cursor-grab shrink-0" />
                  <div className="flex-1 min-w-0">
                    {!isAutoManaged && editingColumn?.id === column.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editingColumn.name}
                          onChange={(e) =>
                            setEditingColumn({ ...editingColumn, name: e.target.value })
                          }
                          className="w-full px-2 py-1 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
                        />
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
                                <button
                                  onClick={() => removeOption(false, idx)}
                                  className="p-1 text-text-muted hover:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => addOption(false)}
                              className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600"
                            >
                              <Plus className="w-4 h-4" />
                              Add option
                            </button>
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingColumn(null)}
                            className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleUpdateColumn}
                            className="px-3 py-1 text-sm bg-primary-500 text-white rounded hover:bg-primary-600"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-text-primary">{column.name}</div>
                          <div className="text-xs text-text-muted">
                            {columnTypes.find((t) => t.value === column.type)?.label}
                            {isAutoManaged && ' (auto-managed)'}
                            {column.options.length > 0 && ` (${column.options.length} options)`}
                          </div>
                        </div>
                        {!isAutoManaged && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                const columnWithColors = {
                                  ...column,
                                  options: column.options.map((opt) => ({
                                    ...opt,
                                    color: opt.color || '#6366f1',
                                  })),
                                };
                                setEditingColumn(columnWithColors);
                              }}
                              className="px-2 py-1 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteColumn(column.id)}
                              className="p-1 text-text-muted hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Column Form */}
          {showAddColumn ? (
            <div className="p-4 bg-surface-tertiary rounded-lg border border-border space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Column Name
                </label>
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Enter column name"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Column Type
                </label>
                <select
                  value={newColumnType}
                  onChange={(e) => {
                    setNewColumnType(e.target.value as ColumnType);
                    setNewColumnOptions([]);
                  }}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
                >
                  {addableColumnTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label} - {type.description}
                    </option>
                  ))}
                </select>
              </div>

              {needsOptions(newColumnType) && (
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Options
                  </label>
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
                        <button
                          onClick={() => removeOption(true, idx)}
                          className="p-1 text-text-muted hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addOption(true)}
                      className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600"
                    >
                      <Plus className="w-4 h-4" />
                      Add option
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowAddColumn(false);
                    setNewColumnName('');
                    setNewColumnType('TEXT');
                    setNewColumnOptions([]);
                  }}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddColumn}
                  disabled={!newColumnName.trim()}
                  className="px-4 py-2 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Column
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddColumn(true)}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg border border-dashed border-border"
            >
              <Plus className="w-4 h-4" />
              Add Column
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
