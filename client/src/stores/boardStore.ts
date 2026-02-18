import { create } from 'zustand';
import type { Board, Column, ColumnType, Platform, EmailCellValue } from '../types';
import * as api from '../api';
import { connectorAction } from '../api/connectors';

interface TranscriptOverlayState {
  extractionId: string;
  taskTitle: string;
  platform: Platform;
}

interface AdoPushModalState {
  taskId: string;
  columnId: string;
  taskTitle: string;
}

interface SnowPushModalState {
  taskId: string;
  columnId: string;
  taskTitle: string;
  existingSnowSysId?: string;
  existingTicketNumber?: string;
}

interface EmailViewModalState {
  taskId: string;
  columnId: string;
  emailData: EmailCellValue;
}

interface DocumentationPageState {
  taskId: string;
  columnId: string;
  boardId: string;
  taskTitle: string;
  cellValues: Record<string, string>;
}

interface DocViewerModalState {
  fileName: string;
  filePath: string;
}

interface BoardState {
  boards: Board[];
  currentBoard: Board | null;
  loading: boolean;
  error: string | null;

  // Archive view
  isArchiveView: boolean;
  setArchiveView: (active: boolean) => void;

  // Transcript overlay
  transcriptOverlay: TranscriptOverlayState | null;
  openTranscriptOverlay: (extractionId: string, taskTitle: string, platform: Platform) => void;
  closeTranscriptOverlay: () => void;

  // ADO push modal
  adoPushModal: AdoPushModalState | null;
  openAdoPushModal: (taskId: string, columnId: string, taskTitle: string) => void;
  closeAdoPushModal: () => void;

  // SNOW push modal
  snowPushModal: SnowPushModalState | null;
  openSnowPushModal: (taskId: string, columnId: string, taskTitle: string, existingSnowSysId?: string, existingTicketNumber?: string) => void;
  closeSnowPushModal: () => void;

  // ADO import modal
  adoImportModal: boolean;
  openAdoImportModal: () => void;
  closeAdoImportModal: () => void;

  // ServiceNow import modal
  snowImportModal: boolean;
  openSnowImportModal: () => void;
  closeSnowImportModal: () => void;

  // Email import modal
  emailImportModal: boolean;
  openEmailImportModal: () => void;
  closeEmailImportModal: () => void;

  // Email view modal
  emailViewModal: EmailViewModalState | null;
  openEmailViewModal: (taskId: string, columnId: string, emailData: EmailCellValue) => void;
  closeEmailViewModal: () => void;

  // Documentation page
  documentationPage: DocumentationPageState | null;
  openDocumentationPage: (taskId: string, columnId: string, boardId: string, taskTitle: string, cellValues: Record<string, string>) => void;
  closeDocumentationPage: () => void;

  // Document viewer modal
  docViewerModal: DocViewerModalState | null;
  openDocViewerModal: (fileName: string, filePath: string) => void;
  closeDocViewerModal: () => void;

  // Board actions
  fetchBoards: () => Promise<void>;
  fetchBoard: (id: string) => Promise<void>;
  createBoard: (name: string) => Promise<Board>;
  updateBoard: (id: string, name: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;

  // Column actions
  addColumn: (name: string, type: ColumnType, options?: { value: string; color?: string }[]) => Promise<void>;
  updateColumn: (columnId: string, name: string, options?: { value: string; color?: string }[], requiredForCompletion?: boolean) => Promise<void>;
  deleteColumn: (columnId: string) => Promise<void>;
  reorderColumns: (columnIds: string[]) => Promise<void>;
  ensureSourceColumn: () => Promise<Column | null>;
  ensureAdoColumn: () => Promise<Column | null>;
  removeAdoColumn: () => Promise<void>;
  ensureItemNoColumn: () => Promise<Column | null>;
  removeItemNoColumn: () => Promise<void>;
  ensureSnowPushColumn: () => Promise<Column | null>;
  removeSnowPushColumn: () => Promise<void>;
  ensureEmailColumn: () => Promise<Column | null>;
  removeEmailColumn: () => Promise<void>;
  ensureDocumentationColumn: () => Promise<Column | null>;
  removeDocumentationColumn: () => Promise<void>;

  // Generic connector column (for future/dynamic connectors)
  ensureConnectorColumn: (connectorId: string, columnType: ColumnType, columnName: string) => Promise<Column | null>;

  // Task actions
  addTask: (cellValues?: Record<string, string>) => Promise<void>;
  updateTask: (taskId: string, cellValues: Record<string, string>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  reorderTasks: (taskIds: string[]) => Promise<void>;
  bulkCreateTasks: (tasks: { cellValues: Record<string, string> }[]) => Promise<void>;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  boards: [],
  currentBoard: null,
  loading: false,
  error: null,

  // Archive view
  isArchiveView: false,
  setArchiveView: (active: boolean) => {
    if (active) {
      set({ isArchiveView: true, currentBoard: null });
      localStorage.removeItem('taskmesh_currentBoardId');
    } else {
      set({ isArchiveView: false });
    }
  },

  // Transcript overlay
  transcriptOverlay: null,
  openTranscriptOverlay: (extractionId: string, taskTitle: string, platform: Platform) => {
    set({ transcriptOverlay: { extractionId, taskTitle, platform } });
  },
  closeTranscriptOverlay: () => {
    set({ transcriptOverlay: null });
  },

  // ADO push modal
  adoPushModal: null,
  openAdoPushModal: (taskId: string, columnId: string, taskTitle: string) => {
    set({ adoPushModal: { taskId, columnId, taskTitle } });
  },
  closeAdoPushModal: () => {
    set({ adoPushModal: null });
  },

  // SNOW push modal
  snowPushModal: null,
  openSnowPushModal: (taskId: string, columnId: string, taskTitle: string, existingSnowSysId?: string, existingTicketNumber?: string) => {
    set({ snowPushModal: { taskId, columnId, taskTitle, existingSnowSysId, existingTicketNumber } });
  },
  closeSnowPushModal: () => {
    set({ snowPushModal: null });
  },

  // ADO import modal
  adoImportModal: false,
  openAdoImportModal: () => {
    set({ adoImportModal: true });
  },
  closeAdoImportModal: () => {
    set({ adoImportModal: false });
  },

  // ServiceNow import modal
  snowImportModal: false,
  openSnowImportModal: () => {
    set({ snowImportModal: true });
  },
  closeSnowImportModal: () => {
    set({ snowImportModal: false });
  },

  // Email import modal
  emailImportModal: false,
  openEmailImportModal: () => {
    set({ emailImportModal: true });
  },
  closeEmailImportModal: () => {
    set({ emailImportModal: false });
  },

  // Email view modal
  emailViewModal: null,
  openEmailViewModal: (taskId: string, columnId: string, emailData: EmailCellValue) => {
    set({ emailViewModal: { taskId, columnId, emailData } });
  },
  closeEmailViewModal: () => {
    set({ emailViewModal: null });
  },

  // Documentation page
  documentationPage: null,
  openDocumentationPage: (taskId: string, columnId: string, boardId: string, taskTitle: string, cellValues: Record<string, string>) => {
    set({ documentationPage: { taskId, columnId, boardId, taskTitle, cellValues } });
  },
  closeDocumentationPage: () => {
    set({ documentationPage: null });
  },

  // Document viewer modal
  docViewerModal: null,
  openDocViewerModal: (fileName: string, filePath: string) => {
    set({ docViewerModal: { fileName, filePath } });
  },
  closeDocViewerModal: () => {
    set({ docViewerModal: null });
  },

  fetchBoards: async () => {
    set({ loading: true, error: null });
    try {
      const boards = await api.getBoards();
      set({ boards, loading: false });
      // Auto-select previously selected board on refresh
      const savedBoardId = localStorage.getItem('taskmesh_currentBoardId');
      if (savedBoardId && !get().currentBoard && boards.some(b => b.id === savedBoardId)) {
        get().fetchBoard(savedBoardId);
      }
    } catch (error) {
      set({ error: 'Failed to fetch boards', loading: false });
    }
  },

  fetchBoard: async (id: string) => {
    set({ loading: true, error: null, isArchiveView: false });
    try {
      const board = await api.getBoard(id);
      localStorage.setItem('taskmesh_currentBoardId', id);
      set({ currentBoard: board, loading: false });
    } catch (error) {
      set({ error: 'Failed to fetch board', loading: false });
    }
  },

  createBoard: async (name: string) => {
    set({ loading: true, error: null });
    try {
      const board = await api.createBoard(name);
      set((state) => ({
        boards: [board, ...state.boards],
        loading: false,
      }));
      return board;
    } catch (error) {
      set({ error: 'Failed to create board', loading: false });
      throw error;
    }
  },

  updateBoard: async (id: string, name: string) => {
    try {
      await api.updateBoard(id, name);
      set((state) => ({
        boards: state.boards.map(b => b.id === id ? { ...b, name } : b),
        currentBoard: state.currentBoard?.id === id
          ? { ...state.currentBoard, name }
          : state.currentBoard,
      }));
    } catch (error) {
      set({ error: 'Failed to update board' });
    }
  },

  deleteBoard: async (id: string) => {
    try {
      await api.deleteBoard(id);
      if (localStorage.getItem('taskmesh_currentBoardId') === id) {
        localStorage.removeItem('taskmesh_currentBoardId');
      }
      set((state) => ({
        boards: state.boards.filter(b => b.id !== id),
        currentBoard: state.currentBoard?.id === id ? null : state.currentBoard,
      }));
    } catch (error) {
      set({ error: 'Failed to delete board' });
    }
  },

  addColumn: async (name: string, type: ColumnType, options?: { value: string; color?: string }[]) => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      const column = await api.addColumn(currentBoard.id, name, type, options);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns: [...state.currentBoard.columns, column] }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to add column' });
    }
  },

  updateColumn: async (columnId: string, name: string, options?: { value: string; color?: string }[], requiredForCompletion?: boolean) => {
    try {
      const updatedColumn = await api.updateColumn(columnId, name, options, requiredForCompletion);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              columns: state.currentBoard.columns.map(c =>
                c.id === columnId ? updatedColumn : c
              ),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to update column' });
    }
  },

  deleteColumn: async (columnId: string) => {
    try {
      await api.deleteColumn(columnId);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              columns: state.currentBoard.columns.filter(c => c.id !== columnId),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to delete column' });
    }
  },

  reorderColumns: async (columnIds: string[]) => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      const columns = await api.reorderColumns(currentBoard.id, columnIds);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to reorder columns' });
    }
  },

  ensureSourceColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return null;

    // Check if SOURCE column already exists locally
    const existing = currentBoard.columns.find((c) => c.type === 'SOURCE');
    if (existing) return existing;

    try {
      const column = await api.ensureSourceColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns: [...state.currentBoard.columns, column] }
          : null,
      }));
      return column;
    } catch (error) {
      set({ error: 'Failed to ensure source column' });
      return null;
    }
  },

  ensureAdoColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return null;

    // Check if ADO_PUSH column already exists locally
    const existing = currentBoard.columns.find((c) => c.type === 'ADO_PUSH');
    if (existing) return existing;

    try {
      const column = await api.ensureAdoColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns: [...state.currentBoard.columns, column] }
          : null,
      }));
      return column;
    } catch (error) {
      set({ error: 'Failed to ensure ADO column' });
      return null;
    }
  },

  removeAdoColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      await api.removeAdoColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              columns: state.currentBoard.columns.filter((c) => c.type !== 'ADO_PUSH'),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to remove ADO column' });
    }
  },

  ensureItemNoColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return null;

    const existing = currentBoard.columns.find((c) => c.type === 'ITEM_NO');
    if (existing) return existing;

    try {
      const column = await api.ensureItemNoColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns: [...state.currentBoard.columns, column] }
          : null,
      }));
      return column;
    } catch (error) {
      set({ error: 'Failed to ensure ServiceNow column' });
      return null;
    }
  },

  removeItemNoColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      await api.removeItemNoColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              columns: state.currentBoard.columns.filter((c) => c.type !== 'ITEM_NO'),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to remove ServiceNow column' });
    }
  },

  ensureSnowPushColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return null;

    const existing = currentBoard.columns.find((c) => c.type === 'SNOW_PUSH');
    if (existing) return existing;

    try {
      const column = await api.ensureSnowPushColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns: [...state.currentBoard.columns, column] }
          : null,
      }));
      return column;
    } catch (error) {
      set({ error: 'Failed to ensure SNOW Push column' });
      return null;
    }
  },

  removeSnowPushColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      await api.removeSnowPushColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              columns: state.currentBoard.columns.filter((c) => c.type !== 'SNOW_PUSH'),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to remove SNOW Push column' });
    }
  },

  ensureEmailColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return null;

    const existing = currentBoard.columns.find((c) => c.type === 'EMAIL');
    if (existing) return existing;

    try {
      const column = await api.ensureEmailColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns: [...state.currentBoard.columns, column] }
          : null,
      }));
      return column;
    } catch (error) {
      set({ error: 'Failed to ensure email column' });
      return null;
    }
  },

  removeEmailColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      await api.removeEmailColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              columns: state.currentBoard.columns.filter((c) => c.type !== 'EMAIL'),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to remove email column' });
    }
  },

  ensureDocumentationColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return null;

    const existing = currentBoard.columns.find((c) => c.type === 'DOCUMENTATION');
    if (existing) return existing;

    try {
      const column = await api.ensureDocumentationColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns: [...state.currentBoard.columns, column] }
          : null,
      }));
      return column;
    } catch (error) {
      set({ error: 'Failed to ensure documentation column' });
      return null;
    }
  },

  removeDocumentationColumn: async () => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      await api.removeDocumentationColumn(currentBoard.id);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              columns: state.currentBoard.columns.filter((c) => c.type !== 'DOCUMENTATION'),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to remove documentation column' });
    }
  },

  ensureConnectorColumn: async (connectorId: string, columnType: ColumnType, columnName: string) => {
    const { currentBoard } = get();
    if (!currentBoard) return null;

    const existing = currentBoard.columns.find((c) => c.type === columnType);
    if (existing) return existing;

    try {
      const column = await connectorAction<Column>(
        connectorId,
        `ensure-column`,
        { boardId: currentBoard.id, columnType, columnName },
      );
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, columns: [...state.currentBoard.columns, column] }
          : null,
      }));
      return column;
    } catch (error) {
      set({ error: `Failed to ensure ${columnName} column` });
      return null;
    }
  },

  addTask: async (cellValues?: Record<string, string>) => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      const task = await api.addTask(currentBoard.id, cellValues);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, tasks: [...state.currentBoard.tasks, task] }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to add task' });
    }
  },

  updateTask: async (taskId: string, cellValues: Record<string, string>) => {
    try {
      const task = await api.updateTask(taskId, cellValues);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              tasks: state.currentBoard.tasks.map(t =>
                t.id === taskId ? task : t
              ),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to update task' });
    }
  },

  deleteTask: async (taskId: string) => {
    try {
      await api.deleteTask(taskId);
      set((state) => ({
        currentBoard: state.currentBoard
          ? {
              ...state.currentBoard,
              tasks: state.currentBoard.tasks.filter(t => t.id !== taskId),
            }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to delete task' });
    }
  },

  reorderTasks: async (taskIds: string[]) => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      const tasks = await api.reorderTasks(currentBoard.id, taskIds);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, tasks }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to reorder tasks' });
    }
  },

  bulkCreateTasks: async (tasks: { cellValues: Record<string, string> }[]) => {
    const { currentBoard } = get();
    if (!currentBoard) return;

    try {
      const createdTasks = await api.bulkCreateTasks(currentBoard.id, tasks);
      set((state) => ({
        currentBoard: state.currentBoard
          ? { ...state.currentBoard, tasks: [...state.currentBoard.tasks, ...createdTasks] }
          : null,
      }));
    } catch (error) {
      set({ error: 'Failed to create tasks' });
    }
  },
}));
