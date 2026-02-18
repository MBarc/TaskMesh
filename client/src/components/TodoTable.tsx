import { useState, useMemo, useRef, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Plus, Trash2, GripVertical, Loader2, AlertTriangle, Copy } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import { useUiPrefsStore } from '../stores/uiPrefsStore';
import type { Column, ColumnType, SourceCellValue, AdoCellValue, SnowCellValue, SnowPushCellValue, EmailCellValue } from '../types';
import * as api from '../api';
import { CellEditor } from './CellEditor';
import { PlatformBadge } from './PlatformBadge';

function isColumnCompleted(columnType: ColumnType, cellValue: string | undefined): boolean {
  if (!cellValue) return false;
  try {
    const parsed = JSON.parse(cellValue);
    switch (columnType) {
      case 'ADO_PUSH':
        return !!parsed.workItemId;
      case 'ITEM_NO':
        return !!parsed.closed;
      case 'SNOW_PUSH':
        return !!parsed.sysId;
      case 'EMAIL':
        return !!parsed.messageId;
      case 'DOCUMENTATION':
        return !!parsed.filePath;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export function TodoTable() {
  const { currentBoard, addTask, deleteTask, updateTask, reorderTasks, reorderColumns, openTranscriptOverlay, openAdoPushModal, openSnowPushModal, openEmailViewModal, openDocumentationPage, openDocViewerModal } = useBoardStore();
  const [editingCell, setEditingCell] = useState<{ taskId: string; columnId: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; incompleteColumns: { name: string; type: ColumnType }[] } | null>(null);

  const showNewBadge = useUiPrefsStore((s) => s.showNewBadge);
  const columns = currentBoard?.columns || [];
  const tasks = currentBoard?.tasks || [];

  // Row drag-and-drop state
  const dragRowIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragFromGrip = useRef(false);

  // Column drag-and-drop state
  const dragColIndex = useRef<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);
  const [isColDragging, setIsColDragging] = useState(false);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (!dragFromGrip.current) {
      e.preventDefault();
      return;
    }
    dragRowIndex.current = index;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    // Set a transparent drag image so the browser ghost doesn't clash with our styling
    const dragImage = document.createElement('div');
    dragImage.style.opacity = '0';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(dragImage));
  }, []);

  const handleDragEnd = useCallback(() => {
    dragRowIndex.current = null;
    dragFromGrip.current = false;
    setIsDragging(false);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (e.dataTransfer.types.includes('text/x-column')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  }, [dragOverIndex]);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    if (e.dataTransfer.types.includes('text/x-column')) return;
    e.preventDefault();
    const fromIndex = dragRowIndex.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null);
      setIsDragging(false);
      return;
    }

    const taskIds = tasks.map((t) => t.id);
    const [moved] = taskIds.splice(fromIndex, 1);
    taskIds.splice(dropIndex, 0, moved);
    reorderTasks(taskIds);

    dragRowIndex.current = null;
    setIsDragging(false);
    setDragOverIndex(null);
  }, [tasks, reorderTasks]);

  // Column drag handlers
  const handleColDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragColIndex.current = index;
    setIsColDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-column', String(index));
    const dragImage = document.createElement('div');
    dragImage.style.opacity = '0';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(dragImage));
  }, []);

  const handleColDragEnd = useCallback(() => {
    dragColIndex.current = null;
    setIsColDragging(false);
    setDragOverColIndex(null);
  }, []);

  const handleColDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!e.dataTransfer.types.includes('text/x-column')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColIndex !== index) {
      setDragOverColIndex(index);
    }
  }, [dragOverColIndex]);

  const handleColDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragColIndex.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverColIndex(null);
      setIsColDragging(false);
      return;
    }

    const colIds = columns.map((c) => c.id);
    const [moved] = colIds.splice(fromIndex, 1);
    colIds.splice(dropIndex, 0, moved);
    reorderColumns(colIds);

    dragColIndex.current = null;
    setIsColDragging(false);
    setDragOverColIndex(null);
  }, [columns, reorderColumns]);

  const handleDeleteTask = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const requiredColumns = columns.filter((c) => c.requiredForCompletion);
    if (requiredColumns.length === 0) {
      deleteTask(taskId);
      return;
    }

    const cellMap = new Map(task.cellValues.map((cv) => [cv.columnId, cv.value]));
    const incomplete = requiredColumns.filter(
      (col) => !isColumnCompleted(col.type, cellMap.get(col.id))
    );

    if (incomplete.length === 0) {
      deleteTask(taskId);
    } else {
      setDeleteConfirm({
        taskId,
        incompleteColumns: incomplete.map((c) => ({ name: c.name, type: c.type })),
      });
    }
  }, [tasks, columns, deleteTask]);

  const handleDuplicateTask = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const duplicableTypes = new Set(['TEXT', 'DROPDOWN', 'MULTI_SELECT', 'DATE', 'CHECKBOX', 'NUMBER']);
    const columnTypeMap = new Map(columns.map((c) => [c.id, c.type]));

    const cellValues: Record<string, string> = {};
    task.cellValues.forEach((cv) => {
      const colType = columnTypeMap.get(cv.columnId);
      if (colType && duplicableTypes.has(colType)) {
        cellValues[cv.columnId] = cv.value;
      }
    });

    addTask(cellValues);
  }, [tasks, columns, addTask]);

  // Transform tasks into row data with cell values mapped
  const data = useMemo(() => {
    return tasks.map((task) => {
      const row: Record<string, string> = { id: task.id, _createdAt: task.createdAt };
      task.cellValues.forEach((cv) => {
        row[cv.columnId] = cv.value;
      });
      return row;
    });
  }, [tasks]);

  // Create table columns dynamically
  const tableColumns = useMemo<ColumnDef<Record<string, string>>[]>(() => {
    const cols: ColumnDef<Record<string, string>>[] = [
      {
        id: 'drag',
        header: '',
        size: 40,
        cell: ({ row }) => {
          const createdAt = row.original._createdAt;
          const isNew = createdAt && (Date.now() - new Date(createdAt).getTime()) < 24 * 60 * 60 * 1000;
          return (
            <div
              className="flex items-center gap-1 text-text-muted cursor-grab active:cursor-grabbing"
              onMouseDown={() => { dragFromGrip.current = true; }}
              onMouseUp={() => { dragFromGrip.current = false; }}
            >
              <GripVertical className="w-4 h-4 shrink-0" />
              {isNew && showNewBadge && (
                <span className="px-1 py-px text-[9px] font-bold leading-none rounded-sm text-white shadow-sm" style={{ backgroundColor: '#e8590c' }}>
                  New
                </span>
              )}
            </div>
          );
        },
      },
    ];

    columns.forEach((column) => {
      cols.push({
        id: column.id,
        header: column.name,
        accessorFn: (row) => row[column.id] || '',
        cell: ({ row, getValue }) => {
          const taskId = row.original.id;
          const value = getValue() as string;
          const isEditing = editingCell?.taskId === taskId && editingCell?.columnId === column.id;

          // SOURCE cells render as a clickable badge
          if (column.type === 'SOURCE') {
            if (!value) {
              return (
                <div className="px-2 py-1">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-default"
                    style={{
                      backgroundColor: 'var(--color-primary-50)',
                      color: 'var(--color-primary-500)',
                      border: '1px solid var(--color-primary-300)',
                    }}
                  >
                    Manually Added
                  </span>
                </div>
              );
            }
            try {
              const source: SourceCellValue = JSON.parse(value);
              return (
                <div className="px-2 py-1">
                  <PlatformBadge
                    platform={source.platform}
                    onClick={source.extractionId ? () => openTranscriptOverlay(source.extractionId, source.taskTitle, source.platform) : undefined}
                  />
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

          // ADO_PUSH cells render as a push button or linked badge
          if (column.type === 'ADO_PUSH') {
            if (!value) {
              // Find the task title from the first TEXT column
              const textColumn = columns.find((c) => c.type === 'TEXT');
              const taskTitle = textColumn ? (row.original[textColumn.id] || '') : '';
              return (
                <div className="px-2 py-1">
                  <button
                    onClick={() => openAdoPushModal(taskId, column.id, taskTitle)}
                    className="px-2 py-1 text-xs font-medium rounded transition-colors"
                    style={{
                      color: 'var(--color-primary-500)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: 'var(--color-primary-300)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-primary-50)';
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'var(--color-primary-300)';
                    }}
                  >
                    Push to ADO
                  </button>
                </div>
              );
            }
            try {
              const ado: AdoCellValue = JSON.parse(value);
              return (
                <div className="px-2 py-1">
                  <a
                    href={ado.workItemUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                  >
                    ADO #{ado.workItemId} &#10003;
                  </a>
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

          // ITEM_NO (Item No.) cells render as a close button, closed badge, or linked item number
          if (column.type === 'ITEM_NO') {
            if (!value) return <span className="text-text-muted px-2">-</span>;
            try {
              const item = JSON.parse(value);
              // ADO-sourced items have no sysId — just show a linked badge
              if (!item.sysId) {
                return (
                  <div className="px-2 py-1">
                    <a
                      href={item.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                    >
                      {item.ticketNumber}
                    </a>
                  </div>
                );
              }
              // ServiceNow items with sysId
              const snow: SnowCellValue = item;
              if (snow.closed) {
                return (
                  <div className="px-2 py-1">
                    <a
                      href={snow.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                    >
                      {snow.ticketNumber} &#10003;
                    </a>
                  </div>
                );
              }
              return (
                <div className="px-2 py-1">
                  <SnowCloseButton
                    taskId={taskId}
                    columnId={column.id}
                    sysId={snow.sysId}
                    ticketNumber={snow.ticketNumber}
                  />
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

          // SNOW_PUSH cells render as push button or ticket badge
          if (column.type === 'SNOW_PUSH') {
            if (!value) {
              // Check if this row has an imported ServiceNow ticket (via ITEM_NO column)
              const itemNoColumn = columns.find((c) => c.type === 'ITEM_NO');
              const itemNoValue = itemNoColumn ? row.original[itemNoColumn.id] : '';
              let existingSysId: string | undefined;
              let existingTicketNumber: string | undefined;

              if (itemNoValue) {
                try {
                  const snowData: SnowCellValue = JSON.parse(itemNoValue);
                  existingSysId = snowData.sysId;
                  existingTicketNumber = snowData.ticketNumber;
                } catch {
                  // not valid JSON
                }
              }

              const textColumn = columns.find((c) => c.type === 'TEXT');
              const taskTitle = textColumn ? (row.original[textColumn.id] || '') : '';

              if (existingSysId && existingTicketNumber) {
                return (
                  <div className="px-2 py-1">
                    <button
                      onClick={() => openSnowPushModal(taskId, column.id, taskTitle, existingSysId, existingTicketNumber)}
                      className="px-2 py-1 text-xs font-medium rounded transition-colors"
                      style={{
                        color: 'var(--color-primary-500)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: 'var(--color-primary-300)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--color-primary-50)';
                        e.currentTarget.style.borderColor = 'var(--color-primary-500)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'var(--color-primary-300)';
                      }}
                    >
                      Update {existingTicketNumber}
                    </button>
                  </div>
                );
              }

              return (
                <div className="px-2 py-1">
                  <button
                    onClick={() => openSnowPushModal(taskId, column.id, taskTitle)}
                    className="px-2 py-1 text-xs font-medium rounded transition-colors"
                    style={{
                      color: 'var(--color-primary-500)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: 'var(--color-primary-300)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-primary-50)';
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'var(--color-primary-300)';
                    }}
                  >
                    Push to SNOW
                  </button>
                </div>
              );
            }
            try {
              const snowPush: SnowPushCellValue = JSON.parse(value);
              return (
                <div className="px-2 py-1">
                  <a
                    href={snowPush.ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                  >
                    {snowPush.ticketNumber} &#10003;
                  </a>
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

          // EMAIL cells render as subject badge with reply button
          if (column.type === 'EMAIL') {
            if (!value) return <span className="text-text-muted px-2">-</span>;
            try {
              const emailData: EmailCellValue = JSON.parse(value);
              return (
                <div className="px-2 py-1 flex items-center justify-center gap-2">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium truncate max-w-[200px] cursor-pointer hover:opacity-80"
                    style={{
                      backgroundColor: emailData.provider === 'outlook' ? '#0078d420' : '#ea433520',
                      color: emailData.provider === 'outlook' ? '#0078d4' : '#ea4335',
                      border: `1px solid ${emailData.provider === 'outlook' ? '#0078d430' : '#ea433530'}`,
                    }}
                    title={emailData.subject}
                    onClick={() => openEmailViewModal(taskId, column.id, emailData)}
                  >
                    {emailData.subject}
                  </span>
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

          // DOCUMENTATION cells render as create button or file name badge
          if (column.type === 'DOCUMENTATION') {
            if (!value) {
              const textColumn = columns.find((c) => c.type === 'TEXT');
              const taskTitle = textColumn ? (row.original[textColumn.id] || '') : '';
              const cellValues: Record<string, string> = {};
              columns.forEach((c) => {
                if (row.original[c.id]) cellValues[c.id] = row.original[c.id];
              });
              return (
                <div className="px-2 py-1">
                  <button
                    onClick={() => currentBoard && openDocumentationPage(taskId, column.id, currentBoard.id, taskTitle, cellValues)}
                    className="px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap"
                    style={{
                      color: 'var(--color-primary-500)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: 'var(--color-primary-300)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-primary-50)';
                      e.currentTarget.style.borderColor = 'var(--color-primary-500)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'var(--color-primary-300)';
                    }}
                  >
                    Create Doc
                  </button>
                </div>
              );
            }
            try {
              JSON.parse(value);
              const textCol = columns.find((c) => c.type === 'TEXT');
              const docTaskTitle = textCol ? (row.original[textCol.id] || '') : '';
              const docCellValues: Record<string, string> = {};
              columns.forEach((c) => {
                if (row.original[c.id]) docCellValues[c.id] = row.original[c.id];
              });
              return (
                <div className="px-2 py-1">
                  <button
                    onClick={() => currentBoard && openDocumentationPage(taskId, column.id, currentBoard.id, docTaskTitle, docCellValues)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors cursor-pointer"
                    title="Edit document"
                  >
                    <span className="shrink-0">&#10003;</span>
                    <span>Created</span>
                  </button>
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

          if (isEditing) {
            return (
              <CellEditor
                column={column}
                value={value}
                onSave={(newValue) => {
                  updateTask(taskId, { [column.id]: newValue });
                  setEditingCell(null);
                }}
                onCancel={() => setEditingCell(null)}
              />
            );
          }

          return (
            <div
              onClick={() => setEditingCell({ taskId, columnId: column.id })}
              className="cursor-pointer min-h-[32px] px-2 py-1 hover:bg-surface-tertiary rounded"
            >
              <CellDisplay column={column} value={value} />
            </div>
          );
        },
      });
    });

    cols.push({
      id: 'actions',
      header: '',
      size: 72,
      cell: ({ row }) => (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleDuplicateTask(row.original.id)}
            title="Duplicate row"
            className="p-1 text-text-muted hover:text-primary-500 rounded hover:bg-surface-tertiary"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteTask(row.original.id)}
            title="Delete row"
            className="p-1 text-text-muted hover:text-red-500 rounded hover:bg-surface-tertiary"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    });

    return cols;
  }, [columns, editingCell, updateTask, handleDeleteTask, handleDuplicateTask, openTranscriptOverlay, openAdoPushModal, openSnowPushModal, openEmailViewModal, openDocumentationPage, openDocViewerModal, currentBoard]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleAddTask = () => {
    addTask();
  };

  if (columns.length === 0) {
    return (
      <div className="text-center py-12 bg-surface-secondary rounded-lg border border-border">
        <p className="text-text-secondary mb-4">No columns yet. Add columns to start creating tasks.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const colId = header.column.id;
                  const isContentCol = colId !== 'drag' && colId !== 'actions';
                  const colIdx = isContentCol ? columns.findIndex((c) => c.id === colId) : -1;
                  const badgeTypes = ['SOURCE', 'ADO_PUSH', 'SNOW_PUSH', 'ITEM_NO', 'EMAIL', 'DOCUMENTATION'];
                  const isBadgeCol = isContentCol && colIdx >= 0 && badgeTypes.includes(columns[colIdx].type);
                  const isBeingDraggedCol = isColDragging && dragColIndex.current === colIdx;
                  const isOverCol = isColDragging && dragOverColIndex === colIdx && dragColIndex.current !== colIdx;
                  const dropLeft = isOverCol && dragColIndex.current !== null && dragColIndex.current > colIdx;
                  const dropRight = isOverCol && dragColIndex.current !== null && dragColIndex.current < colIdx;

                  return (
                    <th
                      key={header.id}
                      className={`px-3 py-2 ${isBadgeCol ? 'text-center' : 'text-left'} text-sm font-medium text-text-secondary bg-surface-tertiary${isContentCol ? ' cursor-grab active:cursor-grabbing select-none group relative' : ''}`}
                      style={{
                        width: header.getSize() !== 150 ? header.getSize() : undefined,
                        opacity: isBeingDraggedCol ? 0.4 : undefined,
                        boxShadow: dropLeft
                          ? 'inset 3px 0 0 0 var(--color-primary-500)'
                          : dropRight
                            ? 'inset -3px 0 0 0 var(--color-primary-500)'
                            : undefined,
                        backgroundColor: isOverCol ? 'var(--color-primary-100)' : undefined,
                      }}
                      draggable={isContentCol}
                      onDragStart={isContentCol ? (e) => handleColDragStart(e, colIdx) : undefined}
                      onDragEnd={isContentCol ? handleColDragEnd : undefined}
                      onDragOver={isContentCol ? (e) => handleColDragOver(e, colIdx) : undefined}
                      onDrop={isContentCol ? (e) => handleColDrop(e, colIdx) : undefined}
                    >
                      {header.isPlaceholder
                        ? null
                        : isContentCol ? (
                          <>
                            <GripVertical className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </>
                        ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isBeingDragged = isDragging && dragRowIndex.current === row.index;
              const isOver = isDragging && dragOverIndex === row.index && dragRowIndex.current !== row.index;
              const dropAbove = isOver && dragRowIndex.current !== null && dragRowIndex.current > row.index;
              const dropBelow = isOver && dragRowIndex.current !== null && dragRowIndex.current < row.index;
              return (
                <tr
                  key={row.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, row.index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, row.index)}
                  onDrop={(e) => handleDrop(e, row.index)}
                  className={`border-b border-border transition-all duration-200 ${
                    isBeingDragged
                      ? 'opacity-40 scale-[0.98]'
                      : 'hover:bg-surface-tertiary/50'
                  }`}
                  style={{
                    boxShadow: dropAbove
                      ? 'inset 0 3px 0 0 var(--color-primary-500)'
                      : dropBelow
                        ? 'inset 0 -3px 0 0 var(--color-primary-500)'
                        : 'inset 0 0 0 0 transparent',
                    backgroundColor: isBeingDragged
                      ? 'var(--color-primary-100)'
                      : isOver
                        ? 'var(--color-primary-100)'
                        : undefined,
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const col = columns.find((c) => c.id === cell.column.id);
                    const centered = col && ['SOURCE', 'ADO_PUSH', 'SNOW_PUSH', 'ITEM_NO', 'EMAIL', 'DOCUMENTATION'].includes(col.type);
                    return (
                      <td key={cell.id} className={`px-1 py-1${centered ? ' text-center' : ''}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Task Button */}
      <div className="p-2 border-t border-border">
        <button
          onClick={handleAddTask}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded w-full"
        >
          <Plus className="w-4 h-4" />
          Add task
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Incomplete Requirements</h3>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              The following columns are marked as required for completion but haven't been completed:
            </p>
            <ul className="mb-5 space-y-1">
              {deleteConfirm.incompleteColumns.map((col, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  {col.name}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  deleteTask(deleteConfirm.taskId);
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50"
              >
                Delete Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Cell display component for read-only view
function CellDisplay({ column, value }: { column: Column; value: string }) {
  if (!value) {
    return <span className="text-text-muted">-</span>;
  }

  switch (column.type) {
    case 'CHECKBOX':
      return (
        <input
          type="checkbox"
          checked={value === 'true'}
          readOnly
          className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
        />
      );
    case 'DROPDOWN': {
      const option = column.options.find((o) => o.id === value);
      return (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: option?.color ? `${option.color}20` : undefined,
            color: option?.color || undefined,
          }}
        >
          {option?.value || value}
        </span>
      );
    }
    case 'MULTI_SELECT': {
      try {
        const selectedIds = JSON.parse(value) as string[];
        const selectedOptions = column.options.filter((o) => selectedIds.includes(o.id));
        return (
          <div className="flex flex-wrap gap-1">
            {selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: opt.color ? `${opt.color}20` : undefined,
                  color: opt.color || undefined,
                }}
              >
                {opt.value}
              </span>
            ))}
          </div>
        );
      } catch {
        return <span>{value}</span>;
      }
    }
    case 'DATE':
      try {
        return <span>{new Date(value).toLocaleDateString()}</span>;
      } catch {
        return <span>{value}</span>;
      }
    case 'NUMBER':
      return <span className="font-mono">{value}</span>;
    default:
      return <span>{value}</span>;
  }
}

// Helper component for ITEM_NO button with local closing state
function SnowCloseButton({ taskId, columnId, sysId, ticketNumber }: {
  taskId: string;
  columnId: string;
  sysId: string;
  ticketNumber: string;
}) {
  const [closing, setClosing] = useState(false);

  const handleClose = async () => {
    setClosing(true);
    try {
      const updatedTask = await api.closeSnowIncident(taskId, columnId, sysId);
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
    } catch {
      // Error is silently handled; button remains clickable
    } finally {
      setClosing(false);
    }
  };

  return (
    <button
      onClick={handleClose}
      disabled={closing}
      className="px-2 py-1 text-xs font-medium text-green-600 hover:text-green-700 border border-green-500/30 hover:border-green-500 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
    >
      {closing && <Loader2 className="w-3 h-3 animate-spin" />}
      Close {ticketNumber}
    </button>
  );
}
