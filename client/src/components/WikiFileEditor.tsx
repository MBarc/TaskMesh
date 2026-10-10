import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2, Sparkles, Type } from 'lucide-react';
import { EditorContent } from '@tiptap/react';
import { useMarkdownEditor, EDITOR_CLASSES } from '../hooks/useMarkdownEditor';
import * as api from '../api';
import type { DocFile } from '../types';

type ToolbarTab = 'ai' | 'style';

interface WikiFileEditorProps {
  file: DocFile;
  onDone: (content: string, name: string) => void;
}

export function WikiFileEditor({ file, onDone }: WikiFileEditorProps) {
  const [markdown, setMarkdown] = useState(file.content);
  const [toolbarTab, setToolbarTab] = useState<ToolbarTab>('style');
  const [aiLoading, setAiLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [currentName, setCurrentName] = useState(file.name);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(file.name);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { editor, activePane, loadIntoEditor } = useMarkdownEditor(markdown, setMarkdown);

  // Initialize TipTap with file content on mount
  useEffect(() => {
    loadIntoEditor(file.content);
  }, [loadIntoEditor, file.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.updateDocFile(file.id, { content: markdown });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('idle');
      }
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [markdown, file.id]);

  // Focus name input when entering edit mode
  useEffect(() => {
    if (nameEditing) setTimeout(() => nameInputRef.current?.select(), 30);
  }, [nameEditing]);

  const confirmNameEdit = async () => {
    setNameEditing(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === currentName) { setNameDraft(currentName); return; }
    try {
      await api.updateDocFile(file.id, { name: trimmed });
      setCurrentName(trimmed);
      setNameDraft(trimmed);
    } catch { setNameDraft(currentName); }
  };

  // ── Toolbar helpers ──────────────────────────────────────────────────────────

  const insertStyle = (before: string, after = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    activePane.current = 'left';
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = markdown.substring(start, end);
    setMarkdown(markdown.substring(0, start) + before + selected + after + markdown.substring(end));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + selected.length); }, 0);
  };

  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    activePane.current = 'left';
    const start = ta.selectionStart;
    const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
    setMarkdown(markdown.substring(0, lineStart) + prefix + markdown.substring(lineStart));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); }, 0);
  };

  const handleReword = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return;
    setAiLoading(true);
    try {
      const result = await api.rewordText(markdown.substring(start, end), file.name);
      setMarkdown(markdown.substring(0, start) + result.content + markdown.substring(end));
      activePane.current = 'left';
    } catch { /* silent */ } finally { setAiLoading(false); }
  };

  const handleGenerateSection = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lines = markdown.substring(0, pos).split('\n');
    let sectionName = 'Section';
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^#{1,4}\s+(.+)$/);
      if (m) { sectionName = m[1]; break; }
    }
    setAiLoading(true);
    try {
      const result = await api.generateSection({ sectionName, documentContext: markdown.trim() });
      setMarkdown(markdown.substring(0, pos) + '\n' + result.content + '\n' + markdown.substring(pos));
      activePane.current = 'left';
    } catch { /* silent */ } finally { setAiLoading(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-surface-secondary">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDone(markdown, currentName)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded transition-colors"
          >
            <ArrowLeft size={13} />
            Preview
          </button>
          {nameEditing ? (
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={confirmNameEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmNameEdit();
                else if (e.key === 'Escape') { setNameEditing(false); setNameDraft(currentName); }
              }}
              className="text-sm font-medium bg-surface-tertiary border border-primary-500 rounded px-2 py-0.5 outline-none text-text-primary min-w-0 max-w-xs"
            />
          ) : (
            <span
              className="text-sm font-medium text-text-primary cursor-pointer hover:text-primary-400 transition-colors"
              onDoubleClick={() => { setNameEditing(true); setNameDraft(currentName); }}
              title="Double-click to rename"
            >
              {currentName.endsWith('.md') ? currentName : `${currentName}.md`}
            </span>
          )}
        </div>
        <span className={`text-xs transition-colors ${
          saveStatus === 'saving' ? 'text-text-muted' :
          saveStatus === 'saved' ? 'text-green-500' : 'text-transparent'
        }`}>
          {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
        </span>
      </div>

      {/* Toolbar */}
      <div className="bg-surface-secondary border-b border-border px-4 py-1.5 flex items-center gap-4 shrink-0">
        <div className="flex gap-1">
          {([
            { id: 'ai' as ToolbarTab, label: 'AI', icon: Sparkles },
            { id: 'style' as ToolbarTab, label: 'Style', icon: Type },
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
            <button onClick={handleReword} disabled={aiLoading} className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded transition-colors disabled:opacity-50">
              {aiLoading && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
              Reword Selection
            </button>
            <button onClick={handleGenerateSection} disabled={aiLoading} className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded transition-colors disabled:opacity-50">
              Generate Section
            </button>
          </div>
        )}

        {toolbarTab === 'style' && (
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => insertStyle('**', '**')} className="px-2 py-1 text-xs font-bold text-text-secondary hover:bg-surface-tertiary rounded">B</button>
            <button onClick={() => insertStyle('*', '*')} className="px-2 py-1 text-xs italic text-text-secondary hover:bg-surface-tertiary rounded">I</button>
            <button onClick={() => insertStyle('***', '***')} className="px-2 py-1 text-xs font-bold italic text-text-secondary hover:bg-surface-tertiary rounded">BI</button>
            <div className="h-4 w-px bg-border mx-0.5" />
            <button onClick={() => insertLine('# ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">H1</button>
            <button onClick={() => insertLine('## ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">H2</button>
            <button onClick={() => insertLine('### ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">H3</button>
            <button onClick={() => insertLine('#### ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">H4</button>
            <div className="h-4 w-px bg-border mx-0.5" />
            <button onClick={() => insertLine('- ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded" title="Bullet list">UL</button>
            <button onClick={() => insertLine('1. ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded" title="Numbered list">OL</button>
            <button onClick={() => insertLine('- [ ] ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded" title="Checkbox">CB</button>
            <div className="h-4 w-px bg-border mx-0.5" />
            <button onClick={() => insertStyle('[', '](url)')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">Link</button>
            <button onClick={() => insertStyle('`', '`')} className="px-2 py-1 text-xs font-mono text-text-secondary hover:bg-surface-tertiary rounded">Code</button>
            <button onClick={() => insertLine('> ')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">BQ</button>
            <button onClick={() => insertLine('---\n')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">HR</button>
            <button onClick={() => insertStyle('\n| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n| ', ' |  |  |\n')} className="px-2 py-1 text-xs text-text-secondary hover:bg-surface-tertiary rounded">Table</button>
          </div>
        )}
      </div>

      {/* Dual pane */}
      <div className="flex-1 flex min-h-0">
        {/* Left: raw markdown */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          <div className="px-3 py-1.5 text-xs font-medium text-text-muted bg-surface-tertiary border-b border-border">Markdown</div>
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(e) => { activePane.current = 'left'; setMarkdown(e.target.value); }}
            onFocus={() => { activePane.current = 'left'; }}
            className="flex-1 w-full px-4 py-3 text-sm font-mono bg-surface text-text-primary resize-none outline-none border-none"
            placeholder="Start writing markdown..."
            spellCheck={false}
          />
        </div>
        {/* Right: TipTap preview */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-1.5 text-xs font-medium text-text-muted bg-surface-tertiary border-b border-border">Preview</div>
          <div className="flex-1 overflow-y-auto">
            <EditorContent editor={editor} className={EDITOR_CLASSES} />
          </div>
        </div>
      </div>
    </div>
  );
}
