import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Plus, Trash2, GripVertical, Loader2, AlertTriangle, Copy, X, Download, ChevronUp, ChevronDown, ChevronsUpDown, StickyNote } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import { useUiPrefsStore } from '../stores/uiPrefsStore';
import { useShortcutStore, normalizeKey } from '../stores/shortcutStore';
import { useSortStore } from '../stores/sortStore';
import { useArchiveStore } from '../stores/archiveStore';
import type { Column, ColumnType, SourceCellValue, AdoCellValue, SnowCellValue, SnowPushCellValue, EmailCellValue } from '../types';

function resolveAlignment(col: Column): 'left' | 'center' | 'right' {
  if (col.alignment && col.alignment !== 'auto') return col.alignment as 'left' | 'center' | 'right';
  const centered: ColumnType[] = ['SOURCE', 'ADO_PUSH', 'SNOW_PUSH', 'ITEM_NO', 'EMAIL', 'DOCUMENTATION', 'CHECKBOX'];
  const right: ColumnType[] = ['NUMBER'];
  if (centered.includes(col.type)) return 'center';
  if (right.includes(col.type)) return 'right';
  return 'left';
}
import * as api from '../api';
import { CellEditor } from './CellEditor';
import { PlatformBadge } from './PlatformBadge';
import { ExportModal } from './ExportModal';

function compareCellValues(
  aVal: string,
  bVal: string,
  col: Column,
  direction: 'asc' | 'desc'
): number {
  const aEmpty = !aVal;
  const bEmpty = !bVal;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;  // empties always sink to bottom
  if (bEmpty) return -1;

  let cmp = 0;
  switch (col.type) {
    case 'NUMBER': {
      cmp = (parseFloat(aVal) || 0) - (parseFloat(bVal) || 0);
      break;
    }
    case 'CHECKBOX': {
      cmp = (aVal === 'true' ? 1 : 0) - (bVal === 'true' ? 1 : 0);
      break;
    }
    case 'DROPDOWN': {
      const aOpt = col.options.find((o) => o.id === aVal)?.value || aVal;
      const bOpt = col.options.find((o) => o.id === bVal)?.value || bVal;
      cmp = aOpt.localeCompare(bOpt);
      break;
    }
    case 'MULTI_SELECT': {
      try {
        const aText = (JSON.parse(aVal) as string[])
          .map((id) => col.options.find((o) => o.id === id)?.value || '')
          .join(', ');
        const bText = (JSON.parse(bVal) as string[])
          .map((id) => col.options.find((o) => o.id === id)?.value || '')
          .join(', ');
        cmp = aText.localeCompare(bText);
      } catch {
        cmp = 0;
      }
      break;
    }
    case 'SOURCE': {
      try {
        const aPlatform = (JSON.parse(aVal) as { platform?: string }).platform || '';
        const bPlatform = (JSON.parse(bVal) as { platform?: string }).platform || '';
        cmp = aPlatform.localeCompare(bPlatform);
      } catch {
        cmp = 0;
      }
      break;
    }
    default: {
      cmp = aVal.localeCompare(bVal);
      break;
    }
  }

  return direction === 'asc' ? cmp : -cmp;
}

function isColumnCompleted(columnType: ColumnType, cellValue: string | undefined): boolean {
  if (!cellValue) return false;
  try {
    const parsed = JSON.parse(cellValue);
    switch (columnType) {
      case 'ADO_PUSH':      return !!parsed.workItemId;
      case 'ITEM_NO':       return !!parsed.closed;
      case 'SNOW_PUSH':     return !!parsed.sysId;
      case 'EMAIL':         return !!parsed.messageId;
      case 'DOCUMENTATION': return !!(parsed.docFileId || parsed.filePath);
      default:              return false;
    }
  } catch {
    return false;
  }
}

export function TodoTable() {
  const { currentBoard, addTask, deleteTask, updateTask, updateTaskNotes, reorderTasks, reorderColumns, bulkCreateTasks, openTranscriptOverlay, openAdoPushModal, openSnowPushModal, openEmailViewModal, openDocumentationPage, openDocViewerModal, highlightedTaskId, setHighlightedTaskId } = useBoardStore();
  const [editingCell, setEditingCell] = useState<{ taskId: string; columnId: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; incompleteColumns: { name: string; type: ColumnType }[] } | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleteFocusedButton, setBulkDeleteFocusedButton] = useState<'cancel' | 'confirm'>('cancel');
  const [bulkWorking, setBulkWorking] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const archiveEnabled = useArchiveStore((s) => s.settings?.archiveEnabled ?? false);

  // Notes expansion state
  const [notesOpenTaskId, setNotesOpenTaskId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const notesRowRef = useRef<HTMLTableRowElement>(null);
  const notesSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard focus model
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);
  // colIndex: -1 = drag handle, 0..M-1 = content columns
  // rowIndex: -1 = header row, 0..N-1 = task rows

  // Keyboard drag state
  const [keyboardRowDrag, setKeyboardRowDrag] = useState<{ fromIndex: number; currentIndex: number } | null>(null);
  const [keyboardColDrag, setKeyboardColDrag] = useState<{ fromIndex: number; currentIndex: number } | null>(null);

  const showNewBadge = useUiPrefsStore((s) => s.showNewBadge);
  const { boardSorts, toggleSort, clearSort } = useSortStore();
  const columns = currentBoard?.columns || [];
  const tasks = currentBoard?.tasks || [];
  const activeSorts = currentBoard ? (boardSorts[currentBoard.id] || []) : [];
  const sortActive = activeSorts.length > 0;

  // Highlighted task (from global search navigation)
  const highlightRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  useEffect(() => {
    if (!highlightedTaskId) return;
    const el = highlightRowRefs.current.get(highlightedTaskId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setHighlightedTaskId(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightedTaskId, tasks, setHighlightedTaskId]);

  // Notes expansion: click-outside to close + save
  useEffect(() => {
    if (!notesOpenTaskId) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (notesRowRef.current && !notesRowRef.current.contains(e.target as Node)) {
        if (notesSaveTimeout.current) clearTimeout(notesSaveTimeout.current);
        updateTaskNotes(notesOpenTaskId, notesValue);
        setNotesOpenTaskId(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [notesOpenTaskId, notesValue, updateTaskNotes]);

  const handleNotesOpen = useCallback((e: React.MouseEvent<HTMLButtonElement>, taskId: string, currentNotes: string) => {
    e.stopPropagation();
    if (notesOpenTaskId === taskId) {
      if (notesSaveTimeout.current) clearTimeout(notesSaveTimeout.current);
      updateTaskNotes(taskId, notesValue);
      setNotesOpenTaskId(null);
      return;
    }
    setNotesValue(currentNotes);
    setNotesOpenTaskId(taskId);
  }, [notesOpenTaskId, notesValue, updateTaskNotes]);

  const handleNotesChange = useCallback((value: string) => {
    setNotesValue(value);
    if (notesSaveTimeout.current) clearTimeout(notesSaveTimeout.current);
    notesSaveTimeout.current = setTimeout(() => {
      if (notesOpenTaskId) updateTaskNotes(notesOpenTaskId, value);
    }, 600);
  }, [notesOpenTaskId, updateTaskNotes]);

  // Sorted display order (does not mutate the store's task array)
  const displayTasks = useMemo(() => {
    if (!sortActive) return tasks;
    const colMap = new Map(columns.map((c) => [c.id, c]));
    return [...tasks].sort((a, b) => {
      const aVals = new Map(a.cellValues.map((cv) => [cv.columnId, cv.value]));
      const bVals = new Map(b.cellValues.map((cv) => [cv.columnId, cv.value]));
      for (const sort of activeSorts) {
        const col = colMap.get(sort.columnId);
        if (!col) continue;
        const cmp = compareCellValues(
          aVals.get(sort.columnId) || '',
          bVals.get(sort.columnId) || '',
          col,
          sort.direction
        );
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [tasks, activeSorts, columns, sortActive]);

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

    const taskIds = displayTasks.map((t) => t.id);
    const [moved] = taskIds.splice(fromIndex, 1);
    taskIds.splice(dropIndex, 0, moved);
    reorderTasks(taskIds);

    dragRowIndex.current = null;
    setIsDragging(false);
    setDragOverIndex(null);
  }, [displayTasks, reorderTasks]);

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

  const handleBulkDuplicate = useCallback(async () => {
    if (bulkWorking) return;
    setBulkWorking(true);
    const duplicableTypes = new Set(['TEXT', 'DROPDOWN', 'MULTI_SELECT', 'DATE', 'CHECKBOX', 'NUMBER']);
    const columnTypeMap = new Map(columns.map((c) => [c.id, c.type]));
    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
    const tasksToCreate = selectedTasks.map(task => {
      const cellValues: Record<string, string> = {};
      task.cellValues.forEach((cv) => {
        const colType = columnTypeMap.get(cv.columnId);
        if (colType && duplicableTypes.has(colType)) {
          cellValues[cv.columnId] = cv.value;
        }
      });
      return { cellValues };
    });
    await bulkCreateTasks(tasksToCreate);
    setSelectedTaskIds(new Set());
    setBulkWorking(false);
  }, [selectedTaskIds, tasks, columns, bulkCreateTasks, bulkWorking]);

  const handleBulkDelete = useCallback(async () => {
    setBulkWorking(true);
    for (const taskId of selectedTaskIds) {
      await deleteTask(taskId);
    }
    setSelectedTaskIds(new Set());
    setBulkDeleteConfirm(false);
    setBulkWorking(false);
  }, [selectedTaskIds, deleteTask]);

  // Open the bulk delete modal, or skip it if archive is enabled (deletion is reversible)
  const triggerBulkDelete = useCallback(() => {
    if (archiveEnabled) {
      handleBulkDelete();
    } else {
      setBulkDeleteFocusedButton('cancel');
      setBulkDeleteConfirm(true);
    }
  }, [archiveEnabled, handleBulkDelete]);

  // Keyboard navigation: cell focus + row/column drag
  useEffect(() => {
    if (!currentBoard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Element;
      // Skip when typing in any input
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      // Handle bulk delete confirmation modal keyboard navigation
      if (bulkDeleteConfirm) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setBulkDeleteFocusedButton(prev => prev === 'cancel' ? 'confirm' : 'cancel');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (bulkDeleteFocusedButton === 'cancel') {
            setBulkDeleteConfirm(false);
          } else {
            handleBulkDelete();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setBulkDeleteConfirm(false);
        }
        return;
      }

      // Pause navigation when the delete confirmation modal is open
      if (deleteConfirm) return;

      // Clear selection on Escape (takes priority over focus clear)
      if (e.key === 'Escape' && selectedTaskIds.size > 0) {
        e.preventDefault();
        setSelectedTaskIds(new Set());
        return;
      }

      // Select all tasks
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedTaskIds(new Set(displayTasks.map(t => t.id)));
        return;
      }

      const rowCount = displayTasks.length;
      const colCount = columns.length + 2; // +1 duplicate button, +1 delete button

      // --- Keyboard row drag mode ---
      if (keyboardRowDrag !== null) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setKeyboardRowDrag((prev) =>
            prev ? { ...prev, currentIndex: Math.max(0, prev.currentIndex - 1) } : null
          );
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setKeyboardRowDrag((prev) =>
            prev ? { ...prev, currentIndex: Math.min(rowCount - 1, prev.currentIndex + 1) } : null
          );
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const { fromIndex, currentIndex } = keyboardRowDrag;
          if (fromIndex !== currentIndex) {
            const taskIds = displayTasks.map((t) => t.id);
            const [moved] = taskIds.splice(fromIndex, 1);
            taskIds.splice(currentIndex, 0, moved);
            reorderTasks(taskIds);
          }
          setKeyboardRowDrag(null);
          setFocusedCell({ rowIndex: currentIndex, colIndex: -1 });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setKeyboardRowDrag(null);
        }
        return;
      }

      // --- Keyboard column drag mode ---
      if (keyboardColDrag !== null) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setKeyboardColDrag((prev) =>
            prev ? { ...prev, currentIndex: Math.max(0, prev.currentIndex - 1) } : null
          );
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setKeyboardColDrag((prev) =>
            prev ? { ...prev, currentIndex: Math.min(colCount - 1, prev.currentIndex + 1) } : null
          );
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const { fromIndex, currentIndex } = keyboardColDrag;
          if (fromIndex !== currentIndex) {
            const colIds = columns.map((c) => c.id);
            const [moved] = colIds.splice(fromIndex, 1);
            colIds.splice(currentIndex, 0, moved);
            reorderColumns(colIds);
          }
          setKeyboardColDrag(null);
          setFocusedCell({ rowIndex: -1, colIndex: currentIndex });
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setKeyboardColDrag(null);
        }
        return;
      }

      // --- Arrow key navigation ---
      // rowIndex: -1=header, 0..rowCount-1=task rows, rowCount="Add task" row
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();

        const current = focusedCell ?? { rowIndex: -1, colIndex: 0 };
        let { rowIndex, colIndex } = current;

        if (e.key === 'ArrowUp') {
          if (rowIndex > 0)        rowIndex--;
          else if (rowIndex === 0) rowIndex = -1; // Enter header row
          // At rowIndex === -1 (header): can't go further up
        } else if (e.key === 'ArrowDown') {
          if (rowIndex === -1)          rowIndex = 0;
          else if (rowIndex < rowCount) rowIndex++; // rowCount = "Add task" row
          // At rowIndex === rowCount: can't go further down
        } else if (e.key === 'ArrowLeft') {
          // No column navigation on the "Add task" row
          if (rowIndex < rowCount && colIndex > -1) colIndex--;
        } else if (e.key === 'ArrowRight') {
          if (rowIndex < rowCount && colIndex < colCount - 1) colIndex++;
        }

        setFocusedCell({ rowIndex, colIndex });
        return;
      }

      // Handle task shortcuts when selection is active (no focused cell needed)
      if (selectedTaskIds.size > 0) {
        const overrides = useShortcutStore.getState().overrides;
        const deleteKey = overrides['delete-task'] ?? 'delete';
        const dupeKey = overrides['duplicate-task'] ?? 'd';
        if (normalizeKey(e) === deleteKey) {
          e.preventDefault();
          triggerBulkDelete();
          return;
        }
        if (normalizeKey(e) === dupeKey) {
          e.preventDefault();
          handleBulkDuplicate();
          return;
        }
      }

      // Keys below require an active focused cell
      if (!focusedCell) return;
      const { rowIndex, colIndex } = focusedCell;

      if (e.key === 'Escape') {
        e.preventDefault();
        setFocusedCell(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (rowIndex === rowCount) {
          // "Add task" row → create a new task
          // After store update, focusedCell.rowIndex will point to the newly created task
          addTask();
        } else if (rowIndex === -1 && colIndex >= 0) {
          // Header row, content column → enter keyboard column drag mode
          setKeyboardColDrag({ fromIndex: colIndex, currentIndex: colIndex });
        } else if (rowIndex >= 0 && colIndex === -1) {
          // Task row, drag handle → enter keyboard row drag mode (disabled when sorted)
          if (!sortActive) setKeyboardRowDrag({ fromIndex: rowIndex, currentIndex: rowIndex });
        } else if (rowIndex >= 0 && colIndex === columns.length) {
          // Duplicate button → bulk duplicate if selection active, else single
          if (selectedTaskIds.size > 0) {
            handleBulkDuplicate();
          } else {
            const task = displayTasks[rowIndex];
            if (task) handleDuplicateTask(task.id);
          }
        } else if (rowIndex >= 0 && colIndex === columns.length + 1) {
          // Delete button → bulk delete if selection active, else single
          if (selectedTaskIds.size > 0) {
            triggerBulkDelete();
          } else {
            const task = displayTasks[rowIndex];
            if (task) handleDeleteTask(task.id);
          }
        } else if (rowIndex >= 0 && colIndex >= 0) {
          // Task row, content column → start editing or trigger primary action
          const col = columns[colIndex];
          const task = displayTasks[rowIndex];
          if (!col || !task) return;
          const editableTypes = ['TEXT', 'DROPDOWN', 'MULTI_SELECT', 'DATE', 'CHECKBOX', 'NUMBER'];
          if (editableTypes.includes(col.type)) {
            setEditingCell({ taskId: task.id, columnId: col.id });
          } else {
            const cellMap = new Map(task.cellValues.map((cv) => [cv.columnId, cv.value]));
            const textCol = columns.find((c) => c.type === 'TEXT');
            const taskTitle = textCol ? (cellMap.get(textCol.id) || '') : '';
            if (col.type === 'DOCUMENTATION') {
              const cellValues: Record<string, string> = {};
              task.cellValues.forEach((cv) => { if (cv.value) cellValues[cv.columnId] = cv.value; });
              if (currentBoard) openDocumentationPage(task.id, col.id, currentBoard.id, taskTitle, cellValues);
            } else if (col.type === 'ADO_PUSH') {
              openAdoPushModal(task.id, col.id, taskTitle);
            } else if (col.type === 'SNOW_PUSH') {
              const itemNoCol = columns.find((c) => c.type === 'ITEM_NO');
              const itemNoValue = itemNoCol ? cellMap.get(itemNoCol.id) : undefined;
              let sysId: string | undefined;
              let ticketNumber: string | undefined;
              if (itemNoValue) {
                try { const d = JSON.parse(itemNoValue); sysId = d.sysId; ticketNumber = d.ticketNumber; } catch { /* ignore */ }
              }
              openSnowPushModal(task.id, col.id, taskTitle, sysId, ticketNumber);
            } else if (col.type === 'SOURCE') {
              const val = cellMap.get(col.id);
              if (val) {
                try { const src = JSON.parse(val); if (src.extractionId) openTranscriptOverlay(src.extractionId, src.taskTitle, src.platform); } catch { /* ignore */ }
              }
            } else if (col.type === 'EMAIL') {
              const val = cellMap.get(col.id);
              if (val) {
                try { const emailData = JSON.parse(val); openEmailViewModal(task.id, col.id, emailData); } catch { /* ignore */ }
              }
            }
          }
        }
      } else if ((e.key === 'e' || e.key === 'E') && rowIndex >= 0 && rowIndex < rowCount) {
        e.preventDefault();
        const textCol = columns.find((c) => c.type === 'TEXT');
        const task = displayTasks[rowIndex];
        if (textCol && task) {
          setEditingCell({ taskId: task.id, columnId: textCol.id });
        }
      } else if (rowIndex >= 0 && rowIndex < rowCount) {
        // Task shortcuts (delete / duplicate) — single-task mode (selection handled above)
        const overrides = useShortcutStore.getState().overrides;
        const deleteKey = overrides['delete-task'] ?? 'delete';
        const dupeKey = overrides['duplicate-task'] ?? 'd';
        if (normalizeKey(e) === deleteKey) {
          e.preventDefault();
          const task = displayTasks[rowIndex];
          if (task) handleDeleteTask(task.id);
        } else if (normalizeKey(e) === dupeKey) {
          e.preventDefault();
          const task = displayTasks[rowIndex];
          if (task) handleDuplicateTask(task.id);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    currentBoard,
    focusedCell,
    keyboardRowDrag,
    keyboardColDrag,
    columns,
    tasks,
    displayTasks,
    sortActive,
    addTask,
    reorderTasks,
    reorderColumns,
    handleDeleteTask,
    handleDuplicateTask,
    deleteConfirm,
    openDocumentationPage,
    openAdoPushModal,
    openSnowPushModal,
    openTranscriptOverlay,
    openEmailViewModal,
    selectedTaskIds,
    handleBulkDuplicate,
    handleBulkDelete,
    bulkDeleteConfirm,
    bulkDeleteFocusedButton,
    triggerBulkDelete,
  ]);

  // Transform tasks into row data with cell values mapped (uses sorted display order)
  const data = useMemo(() => {
    return displayTasks.map((task) => {
      const row: Record<string, string> = { id: task.id, _createdAt: task.createdAt, _notes: task.notes || '' };
      task.cellValues.forEach((cv) => {
        row[cv.columnId] = cv.value;
      });
      return row;
    });
  }, [displayTasks]);

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

          if (column.type === 'ADO_PUSH') {
            if (!value) {
              const textColumn = columns.find((c) => c.type === 'TEXT');
              const taskTitle = textColumn ? (row.original[textColumn.id] || '') : '';
              return (
                <div className="px-2 py-1">
                  <button
                    onClick={() => openAdoPushModal(taskId, column.id, taskTitle)}
                    className="px-2 py-1 text-xs font-medium rounded transition-colors"
                    style={{ color: 'var(--color-primary-500)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-primary-300)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-primary-50)'; e.currentTarget.style.borderColor = 'var(--color-primary-500)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'var(--color-primary-300)'; }}
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
                  <a href={ado.workItemUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                    ADO #{ado.workItemId} &#10003;
                  </a>
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

          if (column.type === 'ITEM_NO') {
            if (!value) return <span className="text-text-muted px-2">-</span>;
            try {
              const item = JSON.parse(value);
              if (!item.sysId) {
                return (
                  <div className="px-2 py-1">
                    <a href={item.ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors">
                      {item.ticketNumber}
                    </a>
                  </div>
                );
              }
              const snow: SnowCellValue = item;
              if (snow.closed) {
                return (
                  <div className="px-2 py-1">
                    <a href={snow.ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                      {snow.ticketNumber} &#10003;
                    </a>
                  </div>
                );
              }
              return (
                <div className="px-2 py-1">
                  <SnowCloseButton taskId={taskId} columnId={column.id} sysId={snow.sysId} ticketNumber={snow.ticketNumber} />
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

          if (column.type === 'SNOW_PUSH') {
            if (!value) {
              const itemNoColumn = columns.find((c) => c.type === 'ITEM_NO');
              const itemNoValue = itemNoColumn ? row.original[itemNoColumn.id] : '';
              let existingSysId: string | undefined;
              let existingTicketNumber: string | undefined;
              if (itemNoValue) {
                try {
                  const snowData: SnowCellValue = JSON.parse(itemNoValue);
                  existingSysId = snowData.sysId;
                  existingTicketNumber = snowData.ticketNumber;
                } catch { /* not valid JSON */ }
              }
              const textColumn = columns.find((c) => c.type === 'TEXT');
              const taskTitle = textColumn ? (row.original[textColumn.id] || '') : '';

              if (existingSysId && existingTicketNumber) {
                return (
                  <div className="px-2 py-1">
                    <button
                      onClick={() => openSnowPushModal(taskId, column.id, taskTitle, existingSysId, existingTicketNumber)}
                      className="px-2 py-1 text-xs font-medium rounded transition-colors"
                      style={{ color: 'var(--color-primary-500)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-primary-300)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-primary-50)'; e.currentTarget.style.borderColor = 'var(--color-primary-500)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'var(--color-primary-300)'; }}
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
                    style={{ color: 'var(--color-primary-500)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-primary-300)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-primary-50)'; e.currentTarget.style.borderColor = 'var(--color-primary-500)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'var(--color-primary-300)'; }}
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
                  <a href={snowPush.ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                    {snowPush.ticketNumber} &#10003;
                  </a>
                </div>
              );
            } catch {
              return <span className="text-text-muted px-2">-</span>;
            }
          }

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

          if (column.type === 'DOCUMENTATION') {
            if (!value) {
              const textColumn = columns.find((c) => c.type === 'TEXT');
              const taskTitle = textColumn ? (row.original[textColumn.id] || '') : '';
              const cellValues: Record<string, string> = {};
              columns.forEach((c) => { if (row.original[c.id]) cellValues[c.id] = row.original[c.id]; });
              return (
                <div className="px-2 py-1">
                  <button
                    onClick={() => currentBoard && openDocumentationPage(taskId, column.id, currentBoard.id, taskTitle, cellValues)}
                    className="px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap"
                    style={{ color: 'var(--color-primary-500)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-primary-300)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-primary-50)'; e.currentTarget.style.borderColor = 'var(--color-primary-500)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'var(--color-primary-300)'; }}
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
              columns.forEach((c) => { if (row.original[c.id]) docCellValues[c.id] = row.original[c.id]; });
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
      size: 96,
      cell: ({ row }) => {
        const taskId = row.original.id;
        const notes = row.original._notes || '';
        const hasNotes = notes.length > 0;
        return (
          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => handleNotesOpen(e, taskId, notes)}
              title="Notes"
              className={`p-1 rounded hover:bg-surface-tertiary ${notesOpenTaskId === taskId ? 'text-primary-500' : hasNotes ? 'text-primary-400' : 'text-text-muted hover:text-primary-500'}`}
            >
              <StickyNote className="w-4 h-4" />
            </button>
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
        );
      },
    });

    return cols;
  }, [columns, editingCell, updateTask, handleDeleteTask, handleDuplicateTask, handleNotesOpen, notesOpenTaskId, openTranscriptOverlay, openAdoPushModal, openSnowPushModal, openEmailViewModal, openDocumentationPage, openDocViewerModal, currentBoard, showNewBadge]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (columns.length === 0) {
    return (
      <div className="text-center py-12 bg-surface-secondary rounded-lg border border-border">
        <p className="text-text-secondary mb-4">No columns yet. Add columns to start creating tasks.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: sortActive ? '40px' : '0px', opacity: sortActive ? 1 : 0 }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-500/8 border-b border-primary-500/20 text-xs text-primary-600">
          <span className="font-medium">Sorted by:</span>
          {activeSorts.map((s, i) => {
            const col = columns.find((c) => c.id === s.columnId);
            return (
              <span key={s.columnId} className="flex items-center gap-0.5 font-medium">
                {i > 0 && <span className="text-text-muted mr-1">then</span>}
                {col?.name}
                {s.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </span>
            );
          })}
          <button
            onClick={() => currentBoard && clearSort(currentBoard.id)}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-primary-600 hover:bg-primary-500/15 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear sort
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const colId = header.column.id;
                  const isContentCol = colId !== 'drag' && colId !== 'actions';
                  const colIdx = isContentCol ? columns.findIndex((c) => c.id === colId) : -1;
                  const headerCol = isContentCol && colIdx >= 0 ? columns[colIdx] : null;
                  const headerAlignment = headerCol ? resolveAlignment(headerCol) : 'left';
                  const isBeingDraggedCol = isColDragging && dragColIndex.current === colIdx;
                  const isOverCol = isColDragging && dragOverColIndex === colIdx && dragColIndex.current !== colIdx;
                  const dropLeft = isOverCol && dragColIndex.current !== null && dragColIndex.current > colIdx;
                  const dropRight = isOverCol && dragColIndex.current !== null && dragColIndex.current < colIdx;

                  // Keyboard focus / drag visuals
                  const isHeaderFocused = isContentCol && focusedCell?.rowIndex === -1 && focusedCell?.colIndex === colIdx;
                  const isKbColDragSource = isContentCol && keyboardColDrag !== null && keyboardColDrag.fromIndex === colIdx;
                  const isKbColDragTarget = isContentCol && keyboardColDrag !== null && keyboardColDrag.currentIndex === colIdx && keyboardColDrag.fromIndex !== colIdx;

                  // Sort state for this column
                  const sortEntry = isContentCol ? activeSorts.find((s) => s.columnId === colId) : undefined;
                  const sortPriority = sortEntry ? activeSorts.indexOf(sortEntry) + 1 : 0;

                  return (
                    <th
                      key={header.id}
                      className={`px-3 py-2 ${headerAlignment === 'center' ? 'text-center' : headerAlignment === 'right' ? 'text-right' : 'text-left'} text-sm font-medium text-text-secondary bg-surface-tertiary${isContentCol ? ' cursor-grab active:cursor-grabbing select-none group relative' : ''}${isHeaderFocused ? ' ring-2 ring-primary-500 ring-inset' : ''}`}
                      style={{
                        width: header.getSize() !== 150 ? header.getSize() : undefined,
                        opacity: isBeingDraggedCol ? 0.4 : undefined,
                        boxShadow: isKbColDragSource
                          ? 'inset 0 0 0 2px #f59e0b'
                          : dropLeft
                            ? 'inset 3px 0 0 0 var(--color-primary-500)'
                            : dropRight
                              ? 'inset -3px 0 0 0 var(--color-primary-500)'
                              : undefined,
                        backgroundColor: isKbColDragTarget
                          ? 'rgba(245, 158, 11, 0.08)'
                          : isOverCol
                            ? 'var(--color-primary-100)'
                            : undefined,
                      }}
                      draggable={isContentCol}
                      onDragStart={isContentCol ? (e) => handleColDragStart(e, colIdx) : undefined}
                      onDragEnd={isContentCol ? handleColDragEnd : undefined}
                      onDragOver={isContentCol ? (e) => handleColDragOver(e, colIdx) : undefined}
                      onDrop={isContentCol ? (e) => handleColDrop(e, colIdx) : undefined}
                      onClick={isContentCol ? () => {
                        setFocusedCell(null);
                        if (currentBoard) toggleSort(currentBoard.id, colId);
                      } : undefined}
                    >
                      {header.isPlaceholder
                        ? null
                        : isContentCol ? (
                          <div className={`flex items-center gap-1 ${headerAlignment === 'center' ? 'justify-center' : headerAlignment === 'right' ? 'justify-end pr-1' : 'pl-3'}`}>
                            <GripVertical className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                            {sortEntry ? (
                              <span className="flex items-center gap-0.5 text-primary-500 shrink-0">
                                {sortEntry.direction === 'asc'
                                  ? <ChevronUp className="w-3.5 h-3.5" />
                                  : <ChevronDown className="w-3.5 h-3.5" />}
                                {activeSorts.length > 1 && (
                                  <span className="text-[10px] font-bold leading-none">{sortPriority}</span>
                                )}
                              </span>
                            ) : (
                              <ChevronsUpDown className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                            )}
                          </div>
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

              // Keyboard drag visuals
              const isKbRowDragSource = keyboardRowDrag?.fromIndex === row.index;
              const isKbRowDragTarget = keyboardRowDrag !== null && keyboardRowDrag.currentIndex === row.index && keyboardRowDrag.fromIndex !== row.index;

              const isHighlighted = highlightedTaskId === row.original.id;

              return (
                <>
                <tr
                  key={row.id}
                  ref={(el) => {
                    if (el) highlightRowRefs.current.set(row.original.id, el);
                    else highlightRowRefs.current.delete(row.original.id);
                  }}
                  draggable={!sortActive}
                  onDragStart={(e) => handleDragStart(e, row.index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, row.index)}
                  onDrop={(e) => handleDrop(e, row.index)}
                  onClickCapture={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      e.stopPropagation();
                      const taskId = row.original.id;
                      setSelectedTaskIds(prev => {
                        const n = new Set(prev);
                        n.has(taskId) ? n.delete(taskId) : n.add(taskId);
                        return n;
                      });
                      lastSelectedIndexRef.current = row.index;
                    } else if (e.shiftKey) {
                      e.stopPropagation();
                      const anchor = lastSelectedIndexRef.current ?? row.index;
                      const start = Math.min(anchor, row.index);
                      const end = Math.max(anchor, row.index);
                      const ids = displayTasks.slice(start, end + 1).map(t => t.id);
                      setSelectedTaskIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
                    }
                  }}
                  className={`border-b border-border transition-all duration-200 ${
                    selectedTaskIds.has(row.original.id) ? 'bg-primary-100' : ''
                  } ${
                    isBeingDragged
                      ? 'opacity-40 scale-[0.98]'
                      : isKbRowDragSource
                        ? ''
                        : 'hover:bg-surface-tertiary/50'
                  } ${isHighlighted ? 'ring-2 ring-primary-500 ring-inset bg-primary-50' : ''}`}
                  style={{
                    boxShadow: isKbRowDragSource
                      ? 'inset 0 0 0 2px #f59e0b'
                      : isKbRowDragTarget
                        ? (keyboardRowDrag && keyboardRowDrag.currentIndex > keyboardRowDrag.fromIndex
                            ? 'inset 0 -3px 0 0 #f59e0b'
                            : 'inset 0 3px 0 0 #f59e0b')
                        : dropAbove
                          ? 'inset 0 3px 0 0 var(--color-primary-500)'
                          : dropBelow
                            ? 'inset 0 -3px 0 0 var(--color-primary-500)'
                            : 'inset 0 0 0 0 transparent',
                    backgroundColor: isKbRowDragSource
                      ? 'rgba(245, 158, 11, 0.1)'
                      : isKbRowDragTarget
                        ? 'rgba(245, 158, 11, 0.12)'
                        : isBeingDragged
                          ? 'var(--color-primary-100)'
                          : isOver
                            ? 'var(--color-primary-100)'
                            : undefined,
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const col = columns.find((c) => c.id === cell.column.id);
                    const cellAlignment = col ? resolveAlignment(col) : 'left';

                    // Determine this cell's colIndex for focus ring
                    const isDragCol = cell.column.id === 'drag';
                    const isActionsCol = cell.column.id === 'actions';
                    const cellColIdx = isDragCol ? -1 : isActionsCol ? -2 : columns.findIndex((c) => c.id === cell.column.id);
                    const isFocused =
                      !isActionsCol &&
                      !isDragCol &&
                      focusedCell !== null &&
                      focusedCell.rowIndex === row.index &&
                      focusedCell.colIndex === cellColIdx;

                    // Per-element focus for drag and actions columns
                    const isDragFocused = isDragCol && focusedCell?.rowIndex === row.index && focusedCell?.colIndex === -1;
                    const isDuplicateFocused = isActionsCol && focusedCell?.rowIndex === row.index && focusedCell?.colIndex === columns.length;
                    const isDeleteFocused = isActionsCol && focusedCell?.rowIndex === row.index && focusedCell?.colIndex === columns.length + 1;

                    return (
                      <td
                        key={cell.id}
                        className={`px-1 py-1${cellAlignment === 'center' ? ' text-center' : cellAlignment === 'right' ? ' text-right' : ''}${isFocused ? ' ring-2 ring-primary-500 ring-inset' : ''}`}
                        onClick={() => setFocusedCell(null)}
                      >
                        {isDragCol ? (() => {
                          const createdAt = row.original._createdAt;
                          const isNew = showNewBadge && createdAt && (Date.now() - new Date(createdAt).getTime()) < 24 * 60 * 60 * 1000;
                          return (
                            <div className="flex items-center gap-1">
                              {isNew && (
                                <span className="px-1 py-px text-[9px] font-bold leading-none rounded-sm text-white shadow-sm shrink-0" style={{ backgroundColor: '#e8590c' }}>
                                  New
                                </span>
                              )}
                              <div
                                className={`p-0.5 rounded transition-colors ${sortActive ? 'text-text-muted opacity-30 cursor-not-allowed' : `text-text-muted cursor-grab active:cursor-grabbing ${isDragFocused ? 'ring-2 ring-primary-500 ring-inset' : ''}`}`}
                                onMouseDown={() => { if (!sortActive) dragFromGrip.current = true; }}
                                onMouseUp={() => { dragFromGrip.current = false; }}
                                title={sortActive ? 'Drag reordering disabled while sorted' : undefined}
                              >
                                <GripVertical className="w-4 h-4 shrink-0" />
                              </div>
                            </div>
                          );
                        })() : isActionsCol ? (
                          <div className="flex items-center gap-0.5">
                            <button
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => handleNotesOpen(e, row.original.id, row.original._notes || '')}
                              title="Notes"
                              className={`p-1 rounded transition-colors relative ${notesOpenTaskId === row.original.id ? 'text-primary-500 bg-surface-tertiary' : 'text-text-muted hover:text-primary-500 hover:bg-surface-tertiary'}`}
                            >
                              <StickyNote className="w-4 h-4" />
                              {(row.original._notes || '').length > 0 && (
                                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary-500" />
                              )}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDuplicateTask(row.original.id); }}
                              title="Duplicate row"
                              className={`p-1 rounded transition-colors ${isDuplicateFocused ? 'ring-2 ring-primary-500 ring-inset text-primary-500 bg-surface-tertiary' : 'text-text-muted hover:text-primary-500 hover:bg-surface-tertiary'}`}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteTask(row.original.id); }}
                              title="Delete row"
                              className={`p-1 rounded transition-colors ${isDeleteFocused ? 'ring-2 ring-red-500 ring-inset text-red-500 bg-surface-tertiary' : 'text-text-muted hover:text-red-500 hover:bg-surface-tertiary'}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
                {notesOpenTaskId === row.original.id && (
                  <tr ref={notesRowRef} key={`${row.id}-notes`} className="border-b border-border bg-surface-secondary">
                    <td colSpan={columns.length + 2} className="pl-12 pr-4 py-3 border-l-2 border-primary-500">
                      <textarea
                        autoFocus
                        value={notesValue}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            if (notesSaveTimeout.current) clearTimeout(notesSaveTimeout.current);
                            updateTaskNotes(notesOpenTaskId, notesValue);
                            setNotesOpenTaskId(null);
                          }
                        }}
                        placeholder="Jot down anything useful for this task..."
                        rows={3}
                        className="w-full resize-none bg-surface text-sm text-text-primary placeholder:text-text-muted p-2 rounded border border-border focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                      />
                      <p className="text-xs text-text-muted mt-1.5">A scratchpad for this task. AI pulls from these notes when generating docs and connector data.</p>
                    </td>
                  </tr>
                )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Task Button */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => { addTask(); setFocusedCell(null); }}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded w-full transition-colors ${
            focusedCell?.rowIndex === tasks.length
              ? 'bg-primary-500/10 text-primary-500 ring-2 ring-primary-500 ring-inset'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-tertiary'
          }`}
        >
          <Plus className="w-4 h-4" />
          Add task
        </button>
      </div>

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Delete {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''}?
            </h3>
            <p className="text-sm text-text-secondary mb-5">This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className={`px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-surface-tertiary ${bulkDeleteFocusedButton === 'cancel' ? 'ring-2 ring-primary-500' : ''}`}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkWorking}
                className={`px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 ${bulkDeleteFocusedButton === 'confirm' ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
              >
                {bulkWorking && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      {selectedTaskIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-surface border border-border rounded-xl shadow-2xl px-4 py-2.5">
          <span className="text-sm font-medium text-text-primary">
            {selectedTaskIds.size} selected
          </span>
          <button
            onClick={() => setSelectedTaskIds(new Set())}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={handleBulkDuplicate}
            disabled={bulkWorking}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-tertiary transition-colors disabled:opacity-50"
          >
            {bulkWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Duplicate
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            disabled={bulkWorking}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface-tertiary transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <div className="w-px h-5 bg-border" />
          <button
            onClick={() => triggerBulkDelete()}
            disabled={bulkWorking}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && currentBoard && (
        <ExportModal
          scope="selected"
          board={currentBoard}
          selectedTaskIds={selectedTaskIds}
          onClose={() => setShowExportModal(false)}
        />
      )}

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
        const [y, m, d] = value.split('T')[0].split('-').map(Number);
        return <span>{new Date(y, m - 1, d).toLocaleDateString()}</span>;
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
