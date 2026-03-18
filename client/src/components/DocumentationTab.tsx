import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import {
  FileText, Folder, FolderOpen, ChevronRight, ChevronDown, Search,
  Plus, Trash2, Edit2, FolderPlus, X, Pencil, Copy, Lock, Info,
} from 'lucide-react';
import { marked } from 'marked';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { DocTree, DocFolder, DocFile, DocFileStub, DocumentationTemplate } from '../types';
import { WikiFileEditor } from './WikiFileEditor';

// ── Types ─────────────────────────────────────────────────────────────────────

type ContextMenuTarget =
  | { kind: 'file'; item: DocFileStub }
  | { kind: 'folder'; item: DocFolder }
  | { kind: 'empty' };

interface ContextMenuState {
  x: number;
  y: number;
  target: ContextMenuTarget;
}

interface InlineEdit {
  kind: 'rename-file' | 'rename-folder' | 'new-file' | 'new-folder';
  id?: string;        // for rename
  parentId?: string | null; // for new-file / new-folder
  value: string;
}

type DragItem =
  | { kind: 'file'; item: DocFileStub }
  | { kind: 'folder'; item: DocFolder };

// ── Helpers ───────────────────────────────────────────────────────────────────

function countFolderChildren(folder: DocFolder): number {
  let count = folder.files.length;
  for (const sub of folder.subfolders) count += sub.files.length + 1;
  return count;
}

function findFolderById(folders: DocFolder[], id: string): DocFolder | null {
  for (const f of folders) {
    if (f.id === id) return f;
    const found = findFolderById(f.subfolders ?? [], id);
    if (found) return found;
  }
  return null;
}

function flattenTree(tree: DocTree): (DocFileStub | DocFolder)[] {
  const items: (DocFileStub | DocFolder)[] = [];
  for (const f of tree.folders) {
    items.push(f);
    for (const sub of f.subfolders) {
      items.push(sub);
      items.push(...sub.files);
    }
    items.push(...f.files);
  }
  items.push(...tree.files);
  return items;
}

function withMd(name: string): string {
  return name.endsWith('.md') ? name : `${name}.md`;
}

function folderMatchesSearch(folder: DocFolder, q: string): boolean {
  if (folder.name.toLowerCase().includes(q)) return true;
  if ((folder.files ?? []).some((f) => f.name.toLowerCase().includes(q))) return true;
  return (folder.subfolders ?? []).some((sub) =>
    sub.name.toLowerCase().includes(q) || (sub.files ?? []).some((f) => f.name.toLowerCase().includes(q))
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DocumentationTab() {
  const { currentBoard } = useBoardStore();

  const [tree, setTree] = useState<DocTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('doc-explorer-expanded');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);
  const [search, setSearch] = useState('');
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const [templates, setTemplates] = useState<DocumentationTemplate[]>([]);
  const [templatesExpanded, setTemplatesExpanded] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentationTemplate | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [editorName, setEditorName] = useState('');
  const [editorNameEditing, setEditorNameEditing] = useState(false);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const editorNameInputRef = useRef<HTMLInputElement>(null);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // ── Drag-over debounce helpers ─────────────────────────────────────────────

  const cancelDragLeave = () => {
    if (dragLeaveTimerRef.current) { clearTimeout(dragLeaveTimerRef.current); dragLeaveTimerRef.current = null; }
  };

  const scheduleClearDragOver = () => {
    cancelDragLeave();
    dragLeaveTimerRef.current = setTimeout(() => setDragOverId(null), 60);
  };

  // ── Load templates (global, not board-scoped) ──────────────────────────────

  useEffect(() => {
    api.getDocumentationSettings().then((s) => setTemplates(s?.templates ?? [])).catch(() => {});
  }, []);

  // ── Load tree ──────────────────────────────────────────────────────────────

  const loadTree = useCallback(async (boardId: string) => {
    setLoading(true);
    try {
      const t = await api.getDocTree(boardId);
      setTree(t);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentBoard) {
      setTree(null);
      setSelectedFile(null);
      setSelectedTreeId(null);
      loadTree(currentBoard.id);
    }
  }, [currentBoard?.id]);

  // ── Persist expanded set ───────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem('doc-explorer-expanded', JSON.stringify([...expandedFolders]));
  }, [expandedFolders]);

  // ── Focus inline input when it mounts ─────────────────────────────────────

  useEffect(() => {
    if (inlineEdit) {
      setTimeout(() => inlineInputRef.current?.focus(), 30);
    }
  }, [inlineEdit]);

  useEffect(() => {
    if (editorNameEditing) {
      setTimeout(() => editorNameInputRef.current?.select(), 30);
    }
  }, [editorNameEditing]);

  // ── Close context menu on outside click ───────────────────────────────────

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [contextMenu]);

  // ── Toast auto-dismiss ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!toast) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, [toast]);

  // ── Sidebar resize ─────────────────────────────────────────────────────────

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    const onMove = (ev: PointerEvent) => {
      if (!sidebarResizeRef.current) return;
      const delta = ev.clientX - sidebarResizeRef.current.startX;
      setSidebarWidth(Math.max(160, Math.min(400, sidebarResizeRef.current.startWidth + delta)));
    };
    const onUp = () => {
      sidebarResizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Tree actions ───────────────────────────────────────────────────────────

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openFile = async (stub: DocFileStub) => {
    setSelectedTreeId(stub.id);
    setViewMode('preview');
    setSelectedTemplate(null);
    try {
      const file = await api.getDocFile(stub.id);
      setSelectedFile(file);
      setEditorName(file.name);
    } catch { /* ignore */ }
  };

  const openTemplate = (template: DocumentationTemplate) => {
    setSelectedTemplate(template);
    setSelectedFile(null);
    setSelectedTreeId(`template:${template.id}`);
    setViewMode('preview');
  };

  const handleCopyTemplate = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedTemplate(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedTemplate(false), 2000);
    }).catch(() => {});
  };

  // ── Editor name rename ─────────────────────────────────────────────────────

  const handleEditorNameConfirm = async () => {
    if (!selectedFile || !editorName.trim()) {
      setEditorNameEditing(false);
      setEditorName(selectedFile?.name ?? '');
      return;
    }
    setEditorNameEditing(false);
    try {
      const updated = await api.updateDocFile(selectedFile.id, { name: editorName.trim() });
      setSelectedFile((prev) => prev ? { ...prev, name: updated.name } : prev);
      // Refresh tree
      if (currentBoard) loadTree(currentBoard.id);
    } catch { setEditorName(selectedFile.name); }
  };

  // ── Inline create/rename ───────────────────────────────────────────────────

  const commitInlineEdit = async () => {
    if (!inlineEdit || !currentBoard) return;
    const value = inlineEdit.value.trim();
    if (!value) { setInlineEdit(null); return; }

    try {
      if (inlineEdit.kind === 'new-folder') {
        await api.createDocFolder({ boardId: currentBoard.id, name: value, parentFolderId: inlineEdit.parentId ?? null });
        if (inlineEdit.parentId) {
          setExpandedFolders((prev) => new Set([...prev, inlineEdit.parentId as string]));
        }
      } else if (inlineEdit.kind === 'new-file') {
        const file = await api.createDocFile({ boardId: currentBoard.id, name: value, folderId: inlineEdit.parentId ?? null });
        if (inlineEdit.parentId) {
          setExpandedFolders((prev) => new Set([...prev, inlineEdit.parentId as string]));
        }
        // Open the new file
        setSelectedFile(file);
        setSelectedTreeId(file.id);
        setEditorName(file.name);
        setViewMode('preview');
      } else if (inlineEdit.kind === 'rename-folder' && inlineEdit.id) {
        await api.renameDocFolder(inlineEdit.id, value);
      } else if (inlineEdit.kind === 'rename-file' && inlineEdit.id) {
        await api.updateDocFile(inlineEdit.id, { name: value });
        if (selectedFile?.id === inlineEdit.id) {
          setSelectedFile((prev) => prev ? { ...prev, name: value } : prev);
          setEditorName(value);
        }
      }
    } catch { /* ignore */ }

    setInlineEdit(null);
    loadTree(currentBoard.id);
  };

  const cancelInlineEdit = () => setInlineEdit(null);

  const handleInlineKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit(); }
    else if (e.key === 'Escape') cancelInlineEdit();
  };

  // ── Delete actions ─────────────────────────────────────────────────────────

  const handleDeleteFile = async (file: DocFileStub) => {
    if (!window.confirm(`Delete "${withMd(file.name)}"? This cannot be undone.`)) return;
    await api.deleteDocFile(file.id).catch(() => {});
    if (selectedFile?.id === file.id) { setSelectedFile(null); setSelectedTreeId(null); }
    if (currentBoard) loadTree(currentBoard.id);
  };

  const handleDeleteFolder = async (folder: DocFolder) => {
    const count = countFolderChildren(folder);
    const msg = count > 0
      ? `Delete "${folder.name}" and all ${count} files inside? This cannot be undone.`
      : `Delete "${folder.name}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    await api.deleteDocFolder(folder.id).catch(() => {});
    if (selectedFile && isFolderAncestor(folder, selectedFile.id)) {
      setSelectedFile(null);
      setSelectedTreeId(null);
    }
    if (currentBoard) loadTree(currentBoard.id);
  };

  const isFolderAncestor = (folder: DocFolder, fileId: string): boolean => {
    if (folder.files.some((f) => f.id === fileId)) return true;
    return folder.subfolders.some((sub) => isFolderAncestor(sub, fileId));
  };

  // ── Context menu ───────────────────────────────────────────────────────────

  const showContextMenu = (e: React.MouseEvent, target: ContextMenuTarget) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, target });
  };

  const handleContextAction = (action: string) => {
    if (!contextMenu) return;
    const { target } = contextMenu;
    setContextMenu(null);

    if (action === 'new-file') {
      const parentId = target.kind === 'folder' ? target.item.id : null;
      if (target.kind === 'folder') setExpandedFolders((prev) => new Set([...prev, target.item.id]));
      setInlineEdit({ kind: 'new-file', parentId, value: '' });
    } else if (action === 'new-folder') {
      const parentId = target.kind === 'folder' ? target.item.id : null;
      setInlineEdit({ kind: 'new-folder', parentId, value: '' });
    } else if (action === 'rename' && target.kind === 'file') {
      setInlineEdit({ kind: 'rename-file', id: target.item.id, value: target.item.name });
    } else if (action === 'rename' && target.kind === 'folder') {
      setInlineEdit({ kind: 'rename-folder', id: target.item.id, value: target.item.name });
    } else if (action === 'delete' && target.kind === 'file') {
      handleDeleteFile(target.item);
    } else if (action === 'delete' && target.kind === 'folder') {
      handleDeleteFolder(target.item as DocFolder);
    }
  };

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const getDropRejection = (dragged: DragItem, targetFolder: DocFolder | null): string | null => {
    if (dragged.kind === 'folder') {
      if (targetFolder === null) return null;
      const folder = dragged.item as DocFolder;
      if (folder.id === targetFolder.id) return null; // silent — dropping on itself
      if (targetFolder.parentFolderId !== null) return 'Subfolders can\'t contain other folders (max 2 levels)';
      if ((folder.subfolders ?? []).length > 0) return 'This folder has subfolders — moving it here would exceed the 2-level limit';
      return null;
    }
    return null;
  };

  const isValidDrop = (dragged: DragItem, targetFolder: DocFolder | null): boolean =>
    getDropRejection(dragged, targetFolder) === null;

  const handleDrop = async (e: React.DragEvent, targetFolder: DocFolder | null) => {
    e.preventDefault();
    setDragOverId(null);
    if (!dragItem || !currentBoard) return;

    const rejection = getDropRejection(dragItem, targetFolder);
    if (rejection) {
      setToast(rejection);
      setDragItem(null);
      return;
    }

    try {
      if (dragItem.kind === 'file') {
        await api.moveDocFile(dragItem.item.id, targetFolder?.id ?? null);
      } else {
        await api.moveDocFolder(dragItem.item.id, targetFolder?.id ?? null);
      }
      loadTree(currentBoard.id);
    } catch { /* ignore */ }

    setDragItem(null);
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (!currentBoard || inlineEdit || editorNameEditing || viewMode === 'edit') return;

      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        setInlineEdit({ kind: 'new-file', parentId: null, value: '' });
      } else if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        setInlineEdit({ kind: 'new-folder', parentId: null, value: '' });
      } else if (e.key === 'F2' && selectedTreeId) {
        e.preventDefault();
        if (tree) {
          const allFiles = flattenTree(tree).filter((i): i is DocFileStub => !('subfolders' in i));
          const file = allFiles.find((f) => f.id === selectedTreeId);
          if (file) setInlineEdit({ kind: 'rename-file', id: file.id, value: file.name });
        }
      } else if (e.key === 'Delete' && selectedTreeId) {
        e.preventDefault();
        if (tree && selectedFile?.id === selectedTreeId) {
          handleDeleteFile(selectedFile);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentBoard, inlineEdit, editorNameEditing, viewMode, selectedTreeId, selectedFile, tree]);

  // ── Search filter ──────────────────────────────────────────────────────────

  const q = search.toLowerCase().trim();

  const filteredFolders = (folders: DocFolder[] | undefined): DocFolder[] => {
    if (!folders) return [];
    if (!q) return folders;
    return folders.filter((f) => folderMatchesSearch(f, q));
  };

  const filteredFiles = (files: DocFileStub[] | undefined): DocFileStub[] => {
    if (!files) return [];
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q));
  };

  // ── Inline input render helper ─────────────────────────────────────────────

  const renderInlineInput = (indent: number) => (
    <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: indent }}>
      <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
      <input
        ref={inlineInputRef}
        value={inlineEdit!.value}
        onChange={(e) => setInlineEdit((prev) => prev ? { ...prev, value: e.target.value } : prev)}
        onKeyDown={handleInlineKey}
        onBlur={commitInlineEdit}
        className="flex-1 text-xs bg-surface-tertiary border border-primary-500 rounded px-1 py-0.5 outline-none text-text-primary min-w-0"
        placeholder={inlineEdit?.kind === 'new-folder' ? 'Folder name...' : 'File name...'}
      />
      <button onMouseDown={(e) => { e.preventDefault(); commitInlineEdit(); }} className="text-green-500 hover:text-green-400">
        <Check size={12} />
      </button>
      <button onMouseDown={(e) => { e.preventDefault(); cancelInlineEdit(); }} className="text-text-muted hover:text-text-secondary">
        <X size={12} />
      </button>
    </div>
  );

  // ── Tree node renderers ────────────────────────────────────────────────────

  const renderFile = (file: DocFileStub, indent: number, isRenaming: boolean) => (
    <div
      key={file.id}
      draggable
      onDragStart={() => setDragItem({ kind: 'file', item: file })}
      onDragEnd={() => { cancelDragLeave(); setDragItem(null); setDragOverId(null); }}
      className={`group flex items-center gap-1 py-0.5 rounded cursor-pointer transition-colors
        ${selectedTreeId === file.id ? 'bg-primary-500/20 text-primary-400' : 'hover:bg-surface-tertiary text-text-secondary'}
        ${dragOverId === file.id ? 'ring-1 ring-primary-500' : ''}
      `}
      style={{ paddingLeft: indent }}
      onClick={() => openFile(file)}
      onContextMenu={(e) => showContextMenu(e, { kind: 'file', item: file })}
    >
      <FileText className="w-3.5 h-3.5 shrink-0" />
      {isRenaming ? (
        <input
          ref={inlineInputRef}
          value={inlineEdit!.value}
          onChange={(e) => setInlineEdit((prev) => prev ? { ...prev, value: e.target.value } : prev)}
          onKeyDown={handleInlineKey}
          onBlur={commitInlineEdit}
          className="flex-1 text-xs bg-surface-tertiary border border-primary-500 rounded px-1 py-0.5 outline-none text-text-primary min-w-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="flex-1 text-xs truncate"
          onDoubleClick={(e) => { e.stopPropagation(); setInlineEdit({ kind: 'rename-file', id: file.id, value: file.name }); }}
        >{withMd(file.name)}</span>
      )}
      {!isRenaming && (
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
          <button
            className="p-0.5 hover:text-primary-400"
            onClick={(e) => { e.stopPropagation(); setInlineEdit({ kind: 'rename-file', id: file.id, value: file.name }); }}
            title="Rename"
          >
            <Edit2 size={11} />
          </button>
          <button
            className="p-0.5 hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); handleDeleteFile(file); }}
            title="Delete"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );

  const renderFolder = (folder: DocFolder, depth: number) => {
    const isExpanded = expandedFolders.has(folder.id);
    const indent = 8 + depth * 16;
    const isRenamingThis = inlineEdit?.kind === 'rename-folder' && inlineEdit.id === folder.id;
    const isNewFileHere = inlineEdit?.kind === 'new-file' && inlineEdit.parentId === folder.id;
    const isNewFolderHere = inlineEdit?.kind === 'new-folder' && inlineEdit.parentId === folder.id;
    const subFolderLabel = depth === 0 ? 'New Subfolder' : undefined;

    const visibleSubfolders = filteredFolders(folder.subfolders);
    const visibleFiles = filteredFiles(folder.files);

    const isDragTarget = dragOverId === folder.id;
    const canDrop = dragItem ? isValidDrop(dragItem, folder) : false;

    return (
      <div key={folder.id}>
        <div
          draggable
          onDragStart={() => setDragItem({ kind: 'folder', item: folder })}
          onDragEnd={() => { cancelDragLeave(); setDragItem(null); setDragOverId(null); }}
          className={`group flex items-center gap-1 py-0.5 rounded cursor-pointer transition-all
            hover:bg-surface-tertiary text-text-secondary
            ${isDragTarget && canDrop ? 'ring-2 ring-primary-500 bg-primary-500/20 text-primary-300' : ''}
            ${isDragTarget && !canDrop ? 'ring-2 ring-red-500/60 bg-red-500/10 opacity-60' : ''}
            ${dragItem && dragItem.item.id === folder.id ? 'opacity-40' : ''}
          `}
          style={{ paddingLeft: indent }}
          onClick={() => { if (!isRenamingThis) toggleFolder(folder.id); }}
          onContextMenu={(e) => showContextMenu(e, { kind: 'folder', item: folder })}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); cancelDragLeave(); setDragOverId(folder.id); }}
          onDragLeave={(e) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClearDragOver(); }}
          onDrop={(e) => { e.stopPropagation(); cancelDragLeave(); handleDrop(e, folder); }}
        >
          <span className="w-3 h-3 text-text-muted shrink-0">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          {isExpanded
            ? <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${isDragTarget && canDrop ? 'text-primary-300' : 'text-primary-400'}`} />
            : <Folder className={`w-3.5 h-3.5 shrink-0 ${isDragTarget && canDrop ? 'text-primary-300' : 'text-text-muted'}`} />
          }
          {isRenamingThis ? (
            <input
              ref={inlineInputRef}
              value={inlineEdit!.value}
              onChange={(e) => setInlineEdit((prev) => prev ? { ...prev, value: e.target.value } : prev)}
              onKeyDown={handleInlineKey}
              onBlur={commitInlineEdit}
              className="flex-1 text-xs bg-surface-tertiary border border-primary-500 rounded px-1 py-0.5 outline-none text-text-primary min-w-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 text-xs font-medium truncate text-text-primary">{folder.name}</span>
          )}
          {isDragTarget && canDrop && (
            <span className="text-[10px] font-medium text-primary-400 bg-primary-500/20 px-1.5 py-0.5 rounded shrink-0 mr-1">
              Drop inside
            </span>
          )}
          {isDragTarget && !canDrop && (() => {
            const reason = dragItem ? getDropRejection(dragItem, folder) : null;
            const label = reason?.includes('subfolders') ? '✕ Has subfolders' : '✕ Max depth (2 levels)';
            return (
              <span className="text-[10px] font-medium text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded shrink-0 mr-1" title={reason ?? undefined}>
                {label}
              </span>
            );
          })()}
          {!isRenamingThis && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
              <button
                className="p-0.5 hover:text-primary-400"
                onClick={(e) => { e.stopPropagation(); setExpandedFolders((prev) => new Set([...prev, folder.id])); setInlineEdit({ kind: 'new-file', parentId: folder.id, value: '' }); }}
                title="New File"
              >
                <Plus size={11} />
              </button>
              {depth === 0 && (
                <button
                  className="p-0.5 hover:text-primary-400"
                  onClick={(e) => { e.stopPropagation(); setExpandedFolders((prev) => new Set([...prev, folder.id])); setInlineEdit({ kind: 'new-folder', parentId: folder.id, value: '' }); }}
                  title={subFolderLabel}
                >
                  <FolderPlus size={11} />
                </button>
              )}
              <button
                className="p-0.5 hover:text-red-400"
                onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                title="Delete folder"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>

        {isExpanded && (
          <div>
            {isNewFolderHere && renderInlineInput(indent + 16)}
            {visibleSubfolders.map((sub) => renderFolder(sub, depth + 1))}
            {isNewFileHere && renderInlineInput(indent + 16)}
            {visibleFiles.map((file) => {
              const isRenaming = inlineEdit?.kind === 'rename-file' && inlineEdit.id === file.id;
              return renderFile(file, indent + 16, isRenaming);
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Templates folder renderer ──────────────────────────────────────────────

  const renderTemplatesFolder = () => {
    const isExpanded = templatesExpanded;
    const filteredTemplates = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;

    return (
      <div>
        <div className="border-t border-border mt-1 mb-1" />
        {/* Folder row */}
        <div
          className="group flex items-center gap-1 py-0.5 rounded cursor-pointer hover:bg-surface-tertiary text-text-secondary"
          style={{ paddingLeft: 8 }}
          onClick={() => setTemplatesExpanded((v) => !v)}
          title="Templates are managed in Settings → Wiki"
        >
          <span className="w-3 h-3 text-text-muted shrink-0">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          {isExpanded
            ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            : <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          }
          <span className="flex-1 text-xs font-medium truncate text-text-primary">Templates</span>
          <span title="To import templates, go to Settings → Wiki" onClick={(e) => e.stopPropagation()}>
            <Info className="w-3 h-3 text-text-muted hover:text-text-secondary shrink-0 transition-colors" />
          </span>
          <span title="Read-only — manage in Settings"><Lock className="w-3 h-3 text-text-muted shrink-0 mr-1" /></span>
        </div>

        {/* Template file rows */}
        {isExpanded && filteredTemplates.map((tpl) => (
          <div
            key={tpl.id}
            className={`flex items-center gap-1 py-0.5 rounded cursor-pointer transition-colors
              ${selectedTreeId === `template:${tpl.id}` ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-surface-tertiary text-text-secondary'}
            `}
            style={{ paddingLeft: 24 }}
            onClick={() => openTemplate(tpl)}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-xs truncate">{tpl.name.endsWith('.md') ? tpl.name : `${tpl.name}.md`}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Empty / no-board states ────────────────────────────────────────────────

  if (!currentBoard) {
    return (
      <div className="flex items-center justify-center h-full py-16 text-center">
        <div>
          <FileText className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <h2 className="text-base font-medium text-text-primary mb-1">No board selected</h2>
          <p className="text-sm text-text-secondary">Select a board to manage its wiki.</p>
        </div>
      </div>
    );
  }

  const isEmpty = tree && tree.folders.length === 0 && tree.files.length === 0;
  const hasSearch = q.length > 0;
  const visibleRootFolders = filteredFolders(tree?.folders ?? []);
  const visibleRootFiles = filteredFiles(tree?.files ?? []);
  const noSearchResults = hasSearch && visibleRootFolders.length === 0 && visibleRootFiles.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden"
      style={{ height: 'calc(100vh - 180px)' }}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* ── Sidebar ── */}
      <div
        className="relative flex flex-col border-r border-border bg-surface-primary shrink-0 min-h-0 overflow-hidden"
        style={{ width: sidebarWidth }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('[data-tree-item]')) return;
          showContextMenu(e, { kind: 'empty' });
        }}
      >
        {/* Search */}
        <div className="px-2 pt-2 pb-1 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-7 pr-2 py-1 text-xs bg-surface-secondary border border-border rounded text-text-primary placeholder:text-text-muted outline-none focus:border-primary-500 transition-colors"
            />
            {search && (
              <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary" onClick={() => setSearch('')}>
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2 pb-1 shrink-0">
          <button
            className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded transition-colors"
            onClick={() => setInlineEdit({ kind: 'new-file', parentId: null, value: '' })}
            title="New File (Ctrl+N)"
          >
            <Plus size={11} /> File
          </button>
          <button
            className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded transition-colors"
            onClick={() => setInlineEdit({ kind: 'new-folder', parentId: null, value: '' })}
            title="New Folder (Ctrl+Shift+N)"
          >
            <FolderPlus size={11} /> Folder
          </button>
        </div>

        <div className="border-t border-border shrink-0" />

        {/* Drag status overlay — absolute so it never affects layout */}
        {(() => {
          if (!dragItem && !toast) return null;

          let content: React.ReactNode;
          let cls = '';

          if (!dragItem) {
            // Post-drop rejection toast
            cls = 'bg-red-500/10 border-red-500/30 text-red-400';
            content = (
              <>
                <span className="shrink-0">⚠</span>
                <span className="flex-1 leading-snug">{toast}</span>
                <button className="shrink-0 hover:text-red-300" onClick={() => setToast(null)}><X size={11} /></button>
              </>
            );
          } else {
            const hoverFolder = dragOverId && dragOverId !== 'root' && tree
              ? findFolderById(tree.folders, dragOverId)
              : null;
            const targetIsRoot = dragOverId === 'root';
            const hasTarget = targetIsRoot || hoverFolder !== null;
            const rejection = hasTarget ? getDropRejection(dragItem, hoverFolder ?? null) : null;
            const valid = hasTarget && rejection === null;
            const targetName = targetIsRoot ? 'root' : hoverFolder?.name ?? null;

            if (!hasTarget) {
              cls = 'bg-surface-secondary border-border text-text-muted';
              content = <span>Drag to a folder to move…</span>;
            } else if (valid) {
              cls = 'bg-green-500/10 border-green-500/30 text-green-400';
              content = <><span>→</span><span className="truncate">Move into "{targetName}"</span></>;
            } else {
              cls = 'bg-red-500/10 border-red-500/30 text-red-400';
              content = <><span className="shrink-0">✕</span><span className="leading-snug">{rejection}</span></>;
            }
          }

          return (
            <div className={`absolute bottom-0 left-0 right-0 z-10 flex items-center gap-1.5 px-2 py-1.5 border-t text-[11px] ${cls}`}>
              {content}
            </div>
          );
        })()}

        {/* Tree */}
        <div
          className={`flex-1 overflow-y-auto overflow-x-hidden p-1 min-h-0 transition-colors ${dragItem && dragOverId === 'root' ? 'bg-primary-500/10 ring-2 ring-inset ring-primary-500/50' : ''}`}
          onDragOver={(e) => { e.preventDefault(); cancelDragLeave(); setDragOverId('root'); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClearDragOver(); }}
          onDrop={(e) => { cancelDragLeave(); handleDrop(e, null); }}
        >
          {loading && (
            <div className="text-xs text-text-muted text-center py-4">Loading...</div>
          )}

          {!loading && isEmpty && !inlineEdit && (
            <div className="text-center py-6 px-2">
              <p className="text-xs text-text-muted leading-relaxed">
                No pages yet. Right-click here or use the buttons above to create your first file or folder.
              </p>
            </div>
          )}

          {!loading && noSearchResults && (
            <div className="text-center py-6 px-2">
              <p className="text-xs text-text-muted">
                Buzz couldn't find anything matching "{search}".
              </p>
            </div>
          )}

          {/* Root-level new folder inline */}
          {inlineEdit?.kind === 'new-folder' && inlineEdit.parentId === null && renderInlineInput(8)}

          {/* Folders */}
          {visibleRootFolders.map((folder) => (
            <div key={folder.id} data-tree-item>
              {renderFolder(folder, 0)}
            </div>
          ))}

          {/* Root-level new file inline */}
          {inlineEdit?.kind === 'new-file' && inlineEdit.parentId === null && renderInlineInput(8)}

          {/* Root files */}
          {visibleRootFiles.map((file) => {
            const isRenaming = inlineEdit?.kind === 'rename-file' && inlineEdit.id === file.id;
            return (
              <div key={file.id} data-tree-item>
                {renderFile(file, 8, isRenaming)}
              </div>
            );
          })}

          {/* Templates (read-only system folder) */}
          {renderTemplatesFolder()}
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary-500/40 transition-colors bg-transparent"
        onPointerDown={onResizePointerDown}
      />

      {/* ── Editor / Preview ── */}
      {selectedFile && viewMode === 'edit' ? (
        <WikiFileEditor
          file={selectedFile}
          onDone={(content, name) => {
            setSelectedFile((prev) => prev ? { ...prev, content, name } : prev);
            setEditorName(name);
            setViewMode('preview');
            if (currentBoard) loadTree(currentBoard.id);
          }}
        />
      ) : (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {selectedTemplate ? (
            <>
              {/* Template preview header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-sm font-medium text-text-primary">
                    {withMd(selectedTemplate.name)}
                  </span>
                  <span className="text-xs text-text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">Template</span>
                </div>
                <button
                  onClick={() => handleCopyTemplate(selectedTemplate.content)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary border border-border rounded-md transition-colors"
                >
                  <Copy size={12} />
                  {copiedTemplate ? 'Copied!' : 'Copy Contents'}
                </button>
              </div>

              {/* Rendered template preview */}
              <div
                className="flex-1 overflow-y-auto px-6 py-4 text-sm text-text-primary [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-3 [&_h4]:font-medium [&_h4]:mb-1 [&_h4]:mt-2 [&_p]:mb-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2 [&_li]:mb-0.5 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-secondary [&_blockquote]:my-2 [&_code]:bg-surface-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-surface-tertiary [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:border-border [&_hr]:my-4 [&_a]:text-primary-400 [&_a]:underline [&_table]:border-collapse [&_table]:w-full [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-surface-tertiary [&_th]:font-medium [&_strong]:font-semibold [&_em]:italic"
                dangerouslySetInnerHTML={{ __html: marked.parse(selectedTemplate.content || '', { async: false }) as string }}
              />
            </>
          ) : selectedFile ? (
            <>
              {/* Preview header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                {editorNameEditing ? (
                  <input
                    ref={editorNameInputRef}
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    onBlur={handleEditorNameConfirm}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditorNameConfirm();
                      else if (e.key === 'Escape') { setEditorNameEditing(false); setEditorName(selectedFile.name); }
                    }}
                    className="text-sm font-medium bg-surface-secondary border border-primary-500 rounded px-2 py-0.5 outline-none text-text-primary"
                  />
                ) : (
                  <span
                    className="text-sm font-medium text-text-primary cursor-pointer hover:text-primary-400 transition-colors"
                    onDoubleClick={() => setEditorNameEditing(true)}
                    title="Double-click to rename"
                  >
                    {withMd(selectedFile.name)}
                  </span>
                )}
                <button
                  onClick={() => setViewMode('edit')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary border border-border rounded-md transition-colors"
                >
                  <Pencil size={12} />
                  Edit
                </button>
              </div>

              {/* Rendered markdown preview */}
              <div
                className="flex-1 overflow-y-auto px-6 py-4 text-sm text-text-primary [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-3 [&_h4]:font-medium [&_h4]:mb-1 [&_h4]:mt-2 [&_p]:mb-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2 [&_li]:mb-0.5 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-secondary [&_blockquote]:my-2 [&_code]:bg-surface-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-surface-tertiary [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:border-border [&_hr]:my-4 [&_a]:text-primary-400 [&_a]:underline [&_table]:border-collapse [&_table]:w-full [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-surface-tertiary [&_th]:font-medium [&_strong]:font-semibold [&_em]:italic"
                dangerouslySetInnerHTML={{ __html: marked.parse(selectedFile.content || '', { async: false }) as string }}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-center px-8">
              <div>
                <FileText className="w-10 h-10 mx-auto text-text-muted mb-3" />
                <p className="text-sm text-text-secondary">
                  Select a file to view it, or right-click in the sidebar to create one.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[150px] bg-surface-secondary border border-border rounded-lg shadow-lg py-1 text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {contextMenu.target.kind === 'file' && (
            <>
              <ContextMenuItem label="Rename" onClick={() => handleContextAction('rename')} icon={<Edit2 size={13} />} />
              <ContextMenuItem label="Delete" onClick={() => handleContextAction('delete')} icon={<Trash2 size={13} />} danger />
            </>
          )}
          {contextMenu.target.kind === 'folder' && (
            <>
              <ContextMenuItem label="New File" onClick={() => handleContextAction('new-file')} icon={<Plus size={13} />} />
              {(contextMenu.target.item as DocFolder).parentFolderId === null && (
                <ContextMenuItem label="New Subfolder" onClick={() => handleContextAction('new-folder')} icon={<FolderPlus size={13} />} />
              )}
              <div className="border-t border-border my-1" />
              <ContextMenuItem label="Rename" onClick={() => handleContextAction('rename')} icon={<Edit2 size={13} />} />
              <ContextMenuItem label="Delete" onClick={() => handleContextAction('delete')} icon={<Trash2 size={13} />} danger />
            </>
          )}
          {contextMenu.target.kind === 'empty' && (
            <>
              <ContextMenuItem label="New File" onClick={() => handleContextAction('new-file')} icon={<Plus size={13} />} />
              <ContextMenuItem label="New Folder" onClick={() => handleContextAction('new-folder')} icon={<FolderPlus size={13} />} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ContextMenuItem({ label, onClick, icon, danger }: { label: string; onClick: () => void; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-tertiary transition-colors ${danger ? 'text-red-400 hover:text-red-300' : 'text-text-primary'}`}
      onClick={onClick}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {label}
    </button>
  );
}
