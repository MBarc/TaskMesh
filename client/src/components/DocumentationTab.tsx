import { useState, useEffect } from 'react';
import { FileText, Plus, Check, Search, FolderOpen } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { DocumentationSettings } from '../types';

export function DocumentationTab() {
  const { currentBoard, openDocumentationPage, openDocViewerModal, ensureDocumentationColumn } = useBoardStore();
  const [settings, setSettings] = useState<DocumentationSettings | null>(null);
  const [search, setSearch] = useState('');
  const [ensuring, setEnsuring] = useState(false);

  useEffect(() => {
    api.getDocumentationSettings().then((s) => {
      if (s) setSettings(s);
    }).catch(() => {});
  }, []);

  if (!currentBoard) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 mx-auto text-text-muted mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">No board selected</h2>
        <p className="text-text-secondary">Select a board to manage documentation for your tasks.</p>
      </div>
    );
  }

  const columns = currentBoard.columns;
  const docColumn = columns.find((c) => c.type === 'DOCUMENTATION');
  const textColumn = columns.find((c) => c.type === 'TEXT');

  // If no documentation column exists, prompt user to enable it
  if (!docColumn) {
    const handleEnable = async () => {
      setEnsuring(true);
      try {
        await ensureDocumentationColumn();
      } finally {
        setEnsuring(false);
      }
    };

    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 mx-auto text-text-muted mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">Documentation not enabled</h2>
        <p className="text-text-secondary mb-6">Enable the documentation column on this board to start creating documents for your tasks.</p>
        <button
          onClick={handleEnable}
          disabled={ensuring}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {ensuring ? 'Enabling...' : 'Enable Documentation'}
        </button>
      </div>
    );
  }

  // Build task list with doc status
  const tasks = currentBoard.tasks.map((task) => {
    const taskTitle = textColumn
      ? (task.cellValues.find((cv) => cv.columnId === textColumn.id)?.value || '')
      : '';
    const docCellValue = task.cellValues.find((cv) => cv.columnId === docColumn.id)?.value || '';

    let docStatus: 'none' | 'draft' | 'created' = 'none';
    let docFileName = '';
    let docFilePath = '';

    if (docCellValue) {
      try {
        const parsed = JSON.parse(docCellValue);
        if (parsed.filePath) {
          docStatus = 'created';
          docFileName = parsed.fileName || '';
          docFilePath = parsed.filePath || '';
        }
      } catch {
        // not valid JSON
      }
    }

    // Build cellValues map for openDocumentationPage
    const cellValues: Record<string, string> = {};
    task.cellValues.forEach((cv) => {
      cellValues[cv.columnId] = cv.value;
    });

    return {
      id: task.id,
      title: taskTitle,
      docStatus,
      docFileName,
      docFilePath,
      cellValues,
    };
  });

  // Filter by search
  const filtered = search.trim()
    ? tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  const createdCount = tasks.filter((t) => t.docStatus === 'created').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Documentation</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            {createdCount} of {tasks.length} tasks documented
            {settings?.localPath && (
              <span className="ml-2 text-text-muted">
                <FolderOpen className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                {settings.localPath.replace(/\\/g, '/')}{settings.subfolder ? `/${settings.subfolder}` : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 rounded-full transition-all duration-300"
          style={{ width: tasks.length > 0 ? `${(createdCount / tasks.length) * 100}%` : '0%' }}
        />
      </div>

      {/* Search */}
      {tasks.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface-secondary border border-border rounded-md text-text-primary placeholder:text-text-muted outline-none focus:border-primary-500 transition-colors"
          />
        </div>
      )}

      {/* Task list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-text-muted text-sm">
            {search ? 'No tasks match your search.' : 'No tasks on this board yet.'}
          </div>
        )}
        {filtered.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 px-4 py-3 bg-surface-secondary rounded-lg border border-border hover:border-primary-500/30 transition-colors"
          >
            {/* Doc status icon */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              task.docStatus === 'created'
                ? 'bg-green-100 text-green-600'
                : 'bg-surface-tertiary text-text-muted'
            }`}>
              {task.docStatus === 'created' ? (
                <Check className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>

            {/* Task info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">
                {task.title || <span className="text-text-muted italic">Untitled task</span>}
              </div>
              {task.docStatus === 'created' && task.docFileName && (
                <div className="text-xs text-text-muted truncate mt-0.5">
                  {task.docFileName}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {task.docStatus === 'created' ? (
                <>
                  <button
                    onClick={() => openDocViewerModal(task.docFileName, task.docFilePath)}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-md border border-border transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={() => openDocumentationPage(task.id, docColumn.id, currentBoard.id, task.title, task.cellValues)}
                    className="px-3 py-1.5 text-xs font-medium text-primary-500 hover:text-primary-600 hover:bg-primary-500/10 rounded-md border border-primary-300 transition-colors"
                  >
                    Edit
                  </button>
                </>
              ) : (
                <button
                  onClick={() => openDocumentationPage(task.id, docColumn.id, currentBoard.id, task.title, task.cellValues)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-md transition-colors"
                >
                  Create Doc
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
