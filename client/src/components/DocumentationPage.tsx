import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, Check, Sparkles, Type, FileText } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { DocumentationTemplate, DocumentationSettings } from '../types';

type ToolbarTab = 'ai' | 'style' | 'template';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Add task list support to turndown
turndownService.addRule('taskListItem', {
  filter: (node) => {
    return node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem';
  },
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute('data-checked') === 'true';
    return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`;
  },
});

export function DocumentationPage() {
  const { documentationPage, closeDocumentationPage, currentBoard } = useBoardStore();
  const [markdown, setMarkdown] = useState('');
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [toolbarTab, setToolbarTab] = useState<ToolbarTab>('style');
  const [templates, setTemplates] = useState<DocumentationTemplate[]>([]);
  const [settings, setSettings] = useState<DocumentationSettings | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef('');
  const activePane = useRef<'left' | 'right'>('left');
  const syncingRef = useRef(false);

  const taskId = documentationPage?.taskId || '';
  const columnId = documentationPage?.columnId || '';
  const boardId = documentationPage?.boardId || '';
  const taskTitle = documentationPage?.taskTitle || '';

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (syncingRef.current) return;
      if (activePane.current !== 'right') return;
      syncingRef.current = true;
      const html = editor.getHTML();
      const md = turndownService.turndown(html);
      setMarkdown(md);
      setTimeout(() => { syncingRef.current = false; }, 50);
    },
    onFocus: () => {
      activePane.current = 'right';
    },
  });

  // Sync markdown -> TipTap (debounced)
  const syncToEditorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editor || syncingRef.current || activePane.current !== 'left') return;
    if (syncToEditorTimer.current) clearTimeout(syncToEditorTimer.current);
    syncToEditorTimer.current = setTimeout(() => {
      syncingRef.current = true;
      const html = marked.parse(markdown, { async: false }) as string;
      editor.commands.setContent(html, { emitUpdate: false });
      setTimeout(() => { syncingRef.current = false; }, 50);
    }, 300);
    return () => {
      if (syncToEditorTimer.current) clearTimeout(syncToEditorTimer.current);
    };
  }, [markdown, editor]);

  // Load settings and templates
  useEffect(() => {
    api.getDocumentationSettings().then((s) => {
      if (s) {
        setSettings(s);
        setTemplates(s.templates || []);
      }
    }).catch(() => {});
  }, []);

  // Load existing draft or saved document
  useEffect(() => {
    if (!taskId) return;
    api.getDocumentDraft(taskId).then(async (draft) => {
      if (draft && draft.status === 'draft') {
        setMarkdown(draft.content);
        setFileName(draft.fileName);
        lastSavedContent.current = draft.content;
        if (editor) {
          const html = marked.parse(draft.content, { async: false }) as string;
          editor.commands.setContent(html, { emitUpdate: false });
        }
      } else {
        // Check if there's already a saved document we can load
        const cellValue = documentationPage?.cellValues?.[columnId];
        if (cellValue) {
          try {
            const docData = JSON.parse(cellValue);
            if (docData.filePath) {
              const result = await api.readDocument(docData.filePath);
              setMarkdown(result.content);
              setFileName(docData.fileName?.replace(/\.md$/, '') || taskTitle || 'Untitled');
              lastSavedContent.current = result.content;
              if (editor) {
                const html = marked.parse(result.content, { async: false }) as string;
                editor.commands.setContent(html, { emitUpdate: false });
              }
            } else {
              setFileName(taskTitle || 'Untitled');
            }
          } catch {
            setFileName(taskTitle || 'Untitled');
          }
        } else {
          setFileName(taskTitle || 'Untitled');
        }
      }
      setDraftLoaded(true);
    }).catch(() => {
      setFileName(taskTitle || 'Untitled');
      setDraftLoaded(true);
    });
  }, [taskId, taskTitle, editor, columnId, documentationPage?.cellValues]);

  // Auto-save drafts every 2s
  const saveDraft = useCallback(async (content: string, name: string) => {
    if (!taskId || !boardId) return;
    if (content === lastSavedContent.current) return;
    try {
      await api.saveDocumentDraft({ taskId, boardId, fileName: name, content });
      lastSavedContent.current = content;
    } catch {
      // Silent fail for auto-save
    }
  }, [taskId, boardId]);

  useEffect(() => {
    if (!draftLoaded) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveDraft(markdown, fileName);
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [markdown, fileName, draftLoaded, saveDraft]);

  const handleSubmit = async () => {
    if (!taskId || !boardId || !columnId) return;
    setSubmitting(true);
    setSubmitFeedback(null);
    try {
      const updatedTask = await api.saveDocument({
        taskId, boardId, columnId, fileName, content: markdown,
      });
      if (currentBoard) {
        useBoardStore.setState({
          currentBoard: {
            ...currentBoard,
            tasks: currentBoard.tasks.map((t) => t.id === updatedTask.id ? updatedTask : t),
          },
        });
      }
      const safeName = fileName.replace(/[<>:"/\\|?*]/g, '_');
      const fullFileName = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
      const normalizedPath = (settings?.localPath || '').replace(/\\/g, '/');
      const filePath = settings?.subfolder
        ? `${normalizedPath}/${settings.subfolder}/${fullFileName}`
        : `${normalizedPath}/${fullFileName}`;
      setSubmitFeedback({ type: 'success', message: `Document saved to ${filePath}` });
      setTimeout(() => closeDocumentationPage(), 1500);
    } catch (err: any) {
      setSubmitFeedback({ type: 'error', message: err.message || 'Failed to save document' });
    } finally {
      setSubmitting(false);
    }
  };

  const substituteVariables = (text: string): string => {
    let result = text;
    result = result.replace(/\{task_name\}/g, taskTitle);
    result = result.replace(/\{date_created\}/g, new Date().toISOString().split('T')[0]);
    result = result.replace(/\{board_name\}/g, currentBoard?.name || '');
    if (documentationPage?.cellValues && currentBoard) {
      currentBoard.columns.forEach((col) => {
        const val = documentationPage.cellValues[col.id] || '';
        const varName = col.name.toLowerCase().replace(/\s+/g, '_');
        result = result.replace(new RegExp(`\\{${varName}\\}`, 'g'), val);
      });
    }
    return result;
  };

  const handleSelectTemplate = (tpl: DocumentationTemplate) => {
    const content = substituteVariables(tpl.content);
    setMarkdown(content);
    const name = substituteVariables(tpl.namingConvention || tpl.name);
    setFileName(name);
    activePane.current = 'left';
    if (editor) {
      const html = marked.parse(content, { async: false }) as string;
      editor.commands.setContent(html, { emitUpdate: false });
    }
  };

  // Style insertion helpers for the left (markdown) pane
  const insertStyle = (before: string, after: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    activePane.current = 'left';
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = markdown.substring(start, end);
    const newText = markdown.substring(0, start) + before + selected + after + markdown.substring(end);
    setMarkdown(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    activePane.current = 'left';
    const start = ta.selectionStart;
    const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
    const newText = markdown.substring(0, lineStart) + prefix + markdown.substring(lineStart);
    setMarkdown(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  // AI handlers
  const handleReword = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return;
    const selected = markdown.substring(start, end);
    setAiLoading(true);
    try {
      const result = await api.rewordText(selected, taskTitle);
      const newText = markdown.substring(0, start) + result.content + markdown.substring(end);
      setMarkdown(newText);
      activePane.current = 'left';
    } catch {
      // silently fail
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateSection = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const textBefore = markdown.substring(0, pos);
    const lines = textBefore.split('\n');
    let sectionName = 'Section';
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(/^#{1,4}\s+(.+)$/);
      if (match) { sectionName = match[1]; break; }
    }
    setAiLoading(true);
    try {
      const result = await api.generateSection({ sectionName, taskContext: taskTitle });
      const newText = markdown.substring(0, pos) + '\n' + result.content + '\n' + markdown.substring(pos);
      setMarkdown(newText);
      activePane.current = 'left';
    } catch {
      // silently fail
    } finally {
      setAiLoading(false);
    }
  };

  if (!documentationPage) return null;

  return (
    <div className="fixed inset-0 bg-surface z-50 flex flex-col">
      {/* Header */}
      <header className="bg-surface-secondary border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={closeDocumentationPage}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-md transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-baseline font-mono text-sm flex-1 min-w-0">
            {settings?.localPath && (
              <span className="text-text-muted whitespace-nowrap shrink-0">
                {settings.localPath.replace(/\\/g, '/')}
                {settings.subfolder ? `/${settings.subfolder}` : ''}/
              </span>
            )}
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="font-semibold text-text-primary bg-transparent border-none outline-none focus:ring-0 py-0.5 rounded hover:bg-surface-tertiary focus:bg-surface-tertiary transition-colors flex-1 min-w-[100px]"
              placeholder="File name..."
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {submitFeedback && (
            <span className={`text-sm ${submitFeedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {submitFeedback.message}
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !markdown.trim()}
            className="px-4 py-2 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Submit
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-surface-secondary border-b border-border px-4 py-1.5 flex items-center gap-4 shrink-0">
        <div className="flex gap-1">
          {([
            { id: 'ai' as ToolbarTab, label: 'AI', icon: Sparkles },
            { id: 'style' as ToolbarTab, label: 'Style', icon: Type },
            { id: 'template' as ToolbarTab, label: 'Template', icon: FileText },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setToolbarTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                toolbarTab === tab.id
                  ? 'bg-primary-500 text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-tertiary'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {toolbarTab === 'ai' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleReword}
              disabled={aiLoading}
              className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded transition-colors disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
              Reword Selection
            </button>
            <button
              onClick={handleGenerateSection}
              disabled={aiLoading}
              className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded transition-colors disabled:opacity-50"
            >
              Generate Section
            </button>
          </div>
        )}

        {toolbarTab === 'style' && (
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => insertStyle('**', '**')} className="px-2 py-1 text-xs font-bold text-text-secondary hover:bg-surface-tertiary rounded" title="Bold">B</button>
            <button onClick={() => insertStyle('*', '*')} className="px-2 py-1 text-xs italic text-text-secondary hover:bg-surface-tertiary rounded" title="Italic">I</button>
            <button onClick={() => insertStyle('***', '***')} className="px-2 py-1 text-xs font-bold italic text-text-secondary hover:bg-surface-tertiary rounded" title="Bold+Italic">BI</button>
            <div className="h-4 w-px bg-border mx-0.5" />
            <button onClick={() => insertLine('# ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">H1</button>
            <button onClick={() => insertLine('## ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">H2</button>
            <button onClick={() => insertLine('### ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">H3</button>
            <button onClick={() => insertLine('#### ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">H4</button>
            <div className="h-4 w-px bg-border mx-0.5" />
            <button onClick={() => insertLine('- ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded" title="Unordered list">UL</button>
            <button onClick={() => insertLine('1. ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded" title="Ordered list">OL</button>
            <button onClick={() => insertLine('- [ ] ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded" title="Checkbox">CB</button>
            <div className="h-4 w-px bg-border mx-0.5" />
            <button onClick={() => insertStyle('[', '](url)')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">Link</button>
            <button onClick={() => insertStyle('`', '`')} className="px-2 py-1 text-xs font-mono text-text-secondary hover:bg-surface-tertiary rounded">Code</button>
            <button onClick={() => insertLine('> ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">BQ</button>
            <button onClick={() => insertLine('---\n')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">HR</button>
            <button
              onClick={() => insertStyle('\n| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n| ', ' |  |  |\n')}
              className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded"
            >
              Table
            </button>
          </div>
        )}

        {toolbarTab === 'template' && (
          <div className="flex items-center gap-2">
            {templates.length === 0 ? (
              <span className="text-xs text-text-muted">No templates configured. Add templates in Settings.</span>
            ) : (
              templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded border border-border transition-colors"
                >
                  {tpl.name || 'Untitled'}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Dual pane editor */}
      <div className="flex-1 flex min-h-0">
        {/* Left pane: raw markdown */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          <div className="px-3 py-1.5 text-xs font-medium text-text-muted bg-surface-tertiary border-b border-border">
            Markdown
          </div>
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(e) => {
              activePane.current = 'left';
              setMarkdown(e.target.value);
            }}
            onFocus={() => { activePane.current = 'left'; }}
            className="flex-1 w-full px-4 py-3 text-sm font-mono bg-surface text-text-primary resize-none outline-none border-none"
            placeholder="Start writing markdown..."
            spellCheck={false}
          />
        </div>

        {/* Right pane: TipTap WYSIWYG */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-1.5 text-xs font-medium text-text-muted bg-surface-tertiary border-b border-border">
            Preview
          </div>
          <div className="flex-1 overflow-y-auto">
            <EditorContent
              editor={editor}
              className="documentation-editor px-6 py-4 text-sm text-text-primary prose prose-sm max-w-none min-h-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-full [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-3 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-medium [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_p]:mb-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_code]:bg-surface-tertiary [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror_pre]:bg-surface-tertiary [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:rounded [&_.ProseMirror_hr]:border-border [&_.ProseMirror_a]:text-primary-500 [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1 [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:bg-surface-tertiary [&_.ProseMirror_.is-empty]:before:content-[attr(data-placeholder)] [&_.ProseMirror_.is-empty]:before:text-text-muted [&_.ProseMirror_.is-empty]:before:float-left [&_.ProseMirror_.is-empty]:before:pointer-events-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
