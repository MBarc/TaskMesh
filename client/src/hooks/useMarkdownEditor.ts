import { useEffect, useRef, useCallback } from 'react';
import { useEditor } from '@tiptap/react';
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

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndownService.addRule('taskListItem', {
  filter: (node) => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute('data-checked') === 'true';
    return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`;
  },
});

const toHtml = (md: string) => marked.parse(md, { async: false }) as string;

export const EDITOR_CLASSES = 'documentation-editor px-6 py-4 text-sm text-text-primary prose prose-sm max-w-none min-h-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-full [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-3 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-medium [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_p]:mb-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_code]:bg-surface-tertiary [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror_pre]:bg-surface-tertiary [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:rounded [&_.ProseMirror_hr]:border-border [&_.ProseMirror_a]:text-primary-500 [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1 [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:bg-surface-tertiary [&_.ProseMirror_.is-empty]:before:content-[attr(data-placeholder)] [&_.ProseMirror_.is-empty]:before:text-text-muted [&_.ProseMirror_.is-empty]:before:float-left [&_.ProseMirror_.is-empty]:before:pointer-events-none';

/**
 * Split-pane markdown editor: a markdown textarea (left) kept in sync with a TipTap
 * rich-text editor (right). Whichever pane the user is in is the source of truth;
 * set `activePane.current = 'left'` before changing `markdown` programmatically.
 */
export function useMarkdownEditor(markdown: string, setMarkdown: (md: string) => void) {
  const activePane = useRef<'left' | 'right'>('left');
  const syncingRef = useRef(false);
  const syncToEditorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Rich-text edits → markdown
    onUpdate: ({ editor }) => {
      if (syncingRef.current || activePane.current !== 'right') return;
      syncingRef.current = true;
      setMarkdown(turndownService.turndown(editor.getHTML()));
      setTimeout(() => { syncingRef.current = false; }, 50);
    },
    onFocus: () => { activePane.current = 'right'; },
  });

  // Markdown edits → rich text (debounced)
  useEffect(() => {
    if (!editor || syncingRef.current || activePane.current !== 'left') return;
    if (syncToEditorTimer.current) clearTimeout(syncToEditorTimer.current);
    syncToEditorTimer.current = setTimeout(() => {
      syncingRef.current = true;
      editor.commands.setContent(toHtml(markdown), { emitUpdate: false });
      setTimeout(() => { syncingRef.current = false; }, 50);
    }, 300);
    return () => { if (syncToEditorTimer.current) clearTimeout(syncToEditorTimer.current); };
  }, [markdown, editor]);

  /** Replace the rich-text pane's content immediately (e.g. after loading a document). */
  const loadIntoEditor = useCallback((md: string) => {
    editor?.commands.setContent(toHtml(md), { emitUpdate: false });
  }, [editor]);

  return { editor, activePane, loadIntoEditor };
}
