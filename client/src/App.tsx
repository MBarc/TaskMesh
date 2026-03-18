import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBoardStore } from './stores/boardStore';
import { useThemeStore } from './stores/themeStore';
import { useUiPrefsStore } from './stores/uiPrefsStore';
import { useShortcutStore, SHORTCUT_DEFS, normalizeKey } from './stores/shortcutStore';
import { useSortStore } from './stores/sortStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { BoardSelector } from './components/BoardSelector';
import { TodoTable } from './components/TodoTable';
import { AIExtractor } from './components/AIExtractor';
import { ThemePicker } from './components/ThemePicker';
import { NotificationCenter } from './components/NotificationCenter';
import { ColumnEditor } from './components/ColumnEditor';
import { TranscriptOverlay } from './components/TranscriptOverlay';
import { ApiKeySettings } from './components/ApiKeySettings';
import { ApiDocsSettings } from './components/ApiDocsSettings';
import { DocumentationPage } from './components/DocumentationPage';
import { DocumentationTab } from './components/DocumentationTab';
import { DocumentationSettingsPanel } from './components/DocumentationSettings';
import { AdoPushModal } from './components/AdoPushModal';
import { SnowPushModal } from './components/SnowPushModal';
import { AdoImportModal } from './components/AdoImportModal';
import { SnowImportModal } from './components/SnowImportModal';
import { EmailImportModal } from './components/EmailImportModal';
import { EmailViewModal } from './components/EmailViewModal';
import { DocViewerModal } from './components/DocViewerModal';
import { CustomThemeImport } from './components/CustomThemeImport';
import { ConnectorImport } from './components/ConnectorImport';
import { ThemeStudio } from './components/ThemeStudio';
import { ArchiveSettings } from './components/ArchiveSettings';
import { PrivacySettings } from './components/PrivacySettings';
import { UpdateSettings } from './components/UpdateSettings';
import { ReleaseNotesModal } from './components/ReleaseNotesModal';
import { ExportModal } from './components/ExportModal';
import { ArchiveBoard } from './components/ArchiveBoard';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { getSettingsComponent, getConnectorIcon } from './components/connectors/registry';
import { getConnectorManifests } from './api/connectors';
import type { ConnectorManifest } from './types/connector';
import { ListTodo, Sparkles, Settings, Download, Mail, Paintbrush, Key, BookOpen, Store, Palette, Plug, ChevronLeft, FileText, Upload, Trash2, Check, Wand2, Archive, ExternalLink, X, Keyboard, RotateCcw, Database, Loader2, Search, Shield } from 'lucide-react';
import * as api from './api';

// Static pages + dynamic connector pages (connector:{id} or connector:{id}:{instanceId})
type SettingsPage = string;

type Tab = 'tasks' | 'ai' | 'docs' | 'settings';

function MarketplacePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-full bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
        <Store className="w-7 h-7 text-primary-500" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">{title}</h3>
      <p className="text-sm text-text-secondary mb-4 max-w-sm mx-auto">{description}</p>
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        Coming Soon
      </span>
    </div>
  );
}

function formatKey(key: string): string {
  return key
    .split('+')
    .map((part) => {
      switch (part) {
        case 'ctrl':   return 'Ctrl';
        case 'shift':  return 'Shift';
        case 'alt':    return 'Alt';
        case 'left':   return '←';
        case 'right':  return '→';
        case 'up':     return '↑';
        case 'down':   return '↓';
        case 'delete': return 'Del';
        case 'escape': return 'Esc';
        case 'enter':  return 'Enter';
        case 'arrows': return '↑ ↓ ← →';
        case 'click':  return 'Click';
        default:       return part.toUpperCase();
      }
    })
    .join('+');
}

// KeyCapture: small inline component to record a new key combo
function KeyCapture({ onCapture }: { onCapture: (key: string) => void }) {
  const [capturing, setCapturing] = useState(false);

  if (capturing) {
    return (
      <div
        tabIndex={0}
        autoFocus
        className="px-2 py-1 text-xs text-text-muted bg-surface-tertiary border border-primary-500 rounded ring-2 ring-primary-500/30 outline-none cursor-text min-w-[130px] text-center"
        onKeyDown={(e) => {
          e.preventDefault();
          // Ignore modifier-only presses
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          const key = normalizeKey(e);
          if (key === 'escape') { setCapturing(false); return; }
          onCapture(key);
          setCapturing(false);
        }}
        onBlur={() => setCapturing(false)}
      >
        Press new shortcut…
      </div>
    );
  }

  return (
    <button
      onClick={() => setCapturing(true)}
      className="px-2 py-1 text-xs text-primary-500 border border-primary-300 rounded hover:bg-primary-50 transition-colors"
    >
      Edit
    </button>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('taskmesh_activeTab');
    return (saved === 'tasks' || saved === 'ai' || saved === 'docs') ? saved : 'tasks';
  });
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage>('appearance');
  const { currentBoard, boards, isArchiveView, fetchBoards, fetchBoard, addTask, openAdoImportModal, openSnowImportModal, openEmailImportModal, emailImportModal, documentationPage, updateBoard, favoriteBoardDeletedNotice, clearFavoriteBoardDeletedNotice, setHighlightedTaskId } = useBoardStore();
  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');
  const [showThemeImport, setShowThemeImport] = useState(false);
  const [showConnectorImport, setShowConnectorImport] = useState(false);
  const themeId = useThemeStore((state) => state.themeId);
  const customThemes = useThemeStore((state) => state.customThemes);
  const setTheme = useThemeStore((state) => state.setTheme);
  const removeCustomTheme = useThemeStore((state) => state.removeCustomTheme);
  const initializeThemes = useThemeStore((state) => state.initialize);
  const initializeSorts = useSortStore((state) => state.initialize);
  const showNewBadge = useUiPrefsStore((s) => s.showNewBadge);
  const setShowNewBadge = useUiPrefsStore((s) => s.setShowNewBadge);
  const triggerNewBoard = useUiPrefsStore((s) => s.triggerNewBoard);
  const [emailQueueCount, setEmailQueueCount] = useState(0);
  const [connectorManifests, setConnectorManifests] = useState<ConnectorManifest[]>([]);

  const shortcutOverrides = useShortcutStore((s) => s.overrides);
  const setShortcutOverride = useShortcutStore((s) => s.setOverride);
  const resetShortcutOverride = useShortcutStore((s) => s.resetOverride);
  const resetAllShortcuts = useShortcutStore((s) => s.resetAll);

  const [showBoardExportModal, setShowBoardExportModal] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllError, setExportAllError] = useState<string | null>(null);

  const emailColumnEnabled = currentBoard?.columns.some(c => c.type === 'EMAIL') ?? false;

  async function handleExportAll() {
    setExportingAll(true);
    setExportAllError(null);
    try {
      await api.exportAll();
    } catch (err) {
      setExportAllError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingAll(false);
    }
  }

  const fetchEmailQueueCount = useCallback(async () => {
    try {
      const queue = await api.getEmailQueue();
      setEmailQueueCount(queue.length);
    } catch {
      // Silently ignore - queue count is non-critical
    }
  }, []);

  useEffect(() => {
    if (!emailColumnEnabled || emailImportModal) return;
    fetchEmailQueueCount();
    const interval = setInterval(fetchEmailQueueCount, 30_000);
    return () => clearInterval(interval);
  }, [emailColumnEnabled, emailImportModal, fetchEmailQueueCount]);

  useEffect(() => {
    if (!emailImportModal && emailColumnEnabled) {
      fetchEmailQueueCount();
    }
  }, [emailImportModal, emailColumnEnabled, fetchEmailQueueCount]);

  useEffect(() => {
    localStorage.setItem('taskmesh_activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    initializeThemes();
  }, [initializeThemes]);

  useEffect(() => {
    initializeSorts();
  }, [initializeSorts]);

  const appLoadedFired = useRef(false);
  useEffect(() => {
    if (appLoadedFired.current) return;
    appLoadedFired.current = true;
    api.appLoaded({ theme: themeId }).catch(() => {});
  }, []);

  const isFirstThemeRender = useRef(true);
  useEffect(() => {
    if (isFirstThemeRender.current) { isFirstThemeRender.current = false; return; }
    api.captureEvent('theme_changed', { theme: themeId }).catch(() => {});
  }, [themeId]);

  const isFirstTabRender = useRef(true);
  useEffect(() => {
    if (isFirstTabRender.current) { isFirstTabRender.current = false; return; }
    api.captureEvent('tab_switched', { tab: activeTab }).catch(() => {});
  }, [activeTab]);

  const refreshConnectors = useCallback(() => {
    getConnectorManifests()
      .then(setConnectorManifests)
      .catch(() => { /* manifests are non-critical */ });
  }, []);

  useEffect(() => {
    refreshConnectors();
  }, [refreshConnectors]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
  }, [themeId]);

  // Global keyboard shortcut handlers
  const shortcutHandlers = useMemo(() => {
    const currentIndex = boards.findIndex((b) => b.id === currentBoard?.id);

    return {
      'global-search': () => {
        setShowSearchModal(true);
      },
      'new-task': () => {
        if (currentBoard) addTask();
      },
      'new-board': () => {
        triggerNewBoard();
      },
      'show-shortcuts': () => {
        setShowShortcutsModal(true);
      },
      'prev-board': () => {
        if (boards.length === 0) return;
        const idx = currentIndex <= 0 ? boards.length - 1 : currentIndex - 1;
        fetchBoard(boards[idx].id);
      },
      'next-board': () => {
        if (boards.length === 0) return;
        const idx = currentIndex >= boards.length - 1 ? 0 : currentIndex + 1;
        fetchBoard(boards[idx].id);
      },
      'board-1': () => { if (boards[0]) fetchBoard(boards[0].id); },
      'board-2': () => { if (boards[1]) fetchBoard(boards[1].id); },
      'board-3': () => { if (boards[2]) fetchBoard(boards[2].id); },
      'board-4': () => { if (boards[3]) fetchBoard(boards[3].id); },
      'board-5': () => { if (boards[4]) fetchBoard(boards[4].id); },
      'board-6': () => { if (boards[5]) fetchBoard(boards[5].id); },
      'board-7': () => { if (boards[6]) fetchBoard(boards[6].id); },
      'board-8': () => { if (boards[7]) fetchBoard(boards[7].id); },
      'board-9': () => { if (boards[8]) fetchBoard(boards[8].id); },
      'ai-extract': () => {
        setActiveTab('ai');
      },
    };
  }, [boards, currentBoard, addTask, fetchBoard, triggerNewBoard]);

  useKeyboardShortcuts(shortcutHandlers);

  const tabs = [
    { id: 'tasks' as Tab, label: 'Tasks', icon: ListTodo },
    { id: 'ai' as Tab, label: 'Smart Extract', icon: Sparkles },
    { id: 'docs' as Tab, label: 'Wiki', icon: FileText },
    { id: 'settings' as Tab, label: 'Settings', icon: Settings },
  ];

  type SettingsItem = { id: SettingsPage; label: string; icon: typeof Paintbrush; href?: string };
  type SettingsSection = { label: string; items: SettingsItem[] };

  const settingsSections: SettingsSection[] = [
    {
      label: 'General',
      items: [
        { id: 'appearance',         label: 'Appearance',          icon: Paintbrush },
        { id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts',  icon: Keyboard },
        { id: 'archive',            label: 'Archive',             icon: Archive },
        { id: 'data',               label: 'Data',                icon: Database },
        { id: 'privacy',            label: 'Privacy',             icon: Shield },
        { id: 'updates',            label: 'Updates',             icon: Download },
        { id: 'wiki-settings',      label: 'Wiki',                icon: FileText },
        { id: 'connectors',         label: 'Connectors',          icon: Plug },
      ],
    },
    {
      label: 'Help',
      items: [
        { id: 'how-to',        label: 'How-to Guides',       icon: ExternalLink, href: 'https://taskmesh.co/docs' },
        { id: 'connector-docs', label: 'Connector SDK Docs', icon: ExternalLink, href: 'https://taskmesh.co/docs/what-is-a-connector' },
      ],
    },
    {
      label: 'Developer',
      items: [
        { id: 'api-keys', label: 'API Keys', icon: Key },
        { id: 'api-docs', label: 'API Docs', icon: BookOpen },
      ],
    },
    {
      label: 'Marketplace',
      items: [
        { id: 'browse-connectors',    label: 'Browse Connectors',    icon: Store },
        { id: 'browse-themes',        label: 'Browse Themes',        icon: Palette },
        { id: 'browse-doc-templates', label: 'Browse Doc Templates', icon: FileText },
      ],
    },
  ];

  type ConnectorCardDef = { pageId: string; label: string; icon: typeof Plug; description: string; brandColor: string };
  type ConnectorCategory = { label: string; connectors: ConnectorCardDef[] };

  const connectorCategories: ConnectorCategory[] = (() => {
    const categoryMap = new Map<string, ConnectorCardDef[]>();

    for (const m of connectorManifests) {
      const cards: ConnectorCardDef[] = [];

      if (m.multiInstance && m.instances && m.instanceMeta) {
        for (const instId of m.instances) {
          const meta = m.instanceMeta[instId];
          if (!meta) continue;
          cards.push({
            pageId: `connector:${m.id}:${instId}`,
            label: meta.name,
            icon: getConnectorIcon(meta.icon),
            description: m.description,
            brandColor: meta.brandColor,
          });
        }
      } else {
        cards.push({
          pageId: `connector:${m.id}`,
          label: m.name,
          icon: getConnectorIcon(m.icon),
          description: m.description,
          brandColor: m.brandColor,
        });
      }

      const existing = categoryMap.get(m.category) || [];
      existing.push(...cards);
      categoryMap.set(m.category, existing);
    }

    const result: ConnectorCategory[] = [];
    for (const [label, connectors] of categoryMap) {
      result.push({ label, connectors });
    }
    return result;
  })();

  // Full-screen Documentation Page takes over the whole layout
  if (documentationPage) {
    return <DocumentationPage />;
  }

  return (
    <div className="min-h-screen bg-surface">
      <ReleaseNotesModal />
      {/* Header */}
      <header className="bg-surface-secondary border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-text-primary">TaskMesh <span className="text-xs font-normal text-text-secondary">All Your Work. One Place.</span></h1>
              <BoardSelector />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSearchModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-tertiary border border-border text-text-secondary hover:text-text-primary hover:border-primary-500/50 transition-colors text-sm"
                title="Search (Ctrl+K)"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="text-xs">Search</span>
              </button>
              <NotificationCenter />
              <ThemePicker />
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-surface-secondary border-b border-border">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-primary-500 border-primary-500'
                    : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Favorite board deleted notice */}
      {favoriteBoardDeletedNotice && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">
              Your favorite board was deleted. Select a new one to set as your favorite.
            </p>
            <button
              onClick={clearFavoriteBoardDeletedNotice}
              className="shrink-0 p-1 rounded hover:bg-amber-100 text-amber-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'tasks' && isArchiveView && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Archive</h2>
            </div>
            <ArchiveBoard />
          </div>
        )}
        {activeTab === 'tasks' && !isArchiveView && !currentBoard && (
          <div className="text-center py-12">
            <ListTodo className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <h2 className="text-lg font-medium text-text-primary mb-2">
              No board selected
            </h2>
            <p className="text-text-secondary mb-4">
              Create a new board or select an existing one to get started.
            </p>
            <button
              onClick={() => setActiveTab('settings')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-primary-500 hover:text-primary-600 hover:bg-surface-tertiary rounded-md transition-colors"
            >
              <Settings className="w-4 h-4" />
              Configure connectors and API keys
            </button>
          </div>
        )}
        {activeTab === 'tasks' && !isArchiveView && currentBoard && (
          <div>
            <div className="flex items-center justify-between mb-4">
              {isEditingBoardName ? (
                <input
                  type="text"
                  value={editBoardName}
                  onChange={(e) => setEditBoardName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const trimmed = editBoardName.trim();
                      if (trimmed && trimmed !== currentBoard.name) {
                        updateBoard(currentBoard.id, trimmed);
                      }
                      setIsEditingBoardName(false);
                    } else if (e.key === 'Escape') {
                      setIsEditingBoardName(false);
                    }
                  }}
                  onBlur={() => {
                    const trimmed = editBoardName.trim();
                    if (trimmed && trimmed !== currentBoard.name) {
                      updateBoard(currentBoard.id, trimmed);
                    }
                    setIsEditingBoardName(false);
                  }}
                  className="text-lg font-semibold text-text-primary bg-transparent border-b-2 border-primary-500 outline-none px-0 py-0"
                  autoFocus
                />
              ) : (
                <h2
                  className="text-lg font-semibold text-text-primary cursor-pointer hover:text-primary-500 transition-colors"
                  onClick={() => {
                    setEditBoardName(currentBoard.name);
                    setIsEditingBoardName(true);
                  }}
                  title="Click to rename board"
                >
                  {currentBoard.name}
                </h2>
              )}
              <div className="flex items-center gap-2">
                {emailColumnEnabled && (
                  <button
                    onClick={openEmailImportModal}
                    className="relative flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-md transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    Import from Email
                    {emailQueueCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 flex items-center justify-center px-1 text-xs font-bold text-white bg-red-500 rounded-full">
                        {emailQueueCount > 99 ? '99+' : emailQueueCount}
                      </span>
                    )}
                  </button>
                )}
                {currentBoard.columns.some(c => c.type === 'ADO_PUSH') && (
                  <button
                    onClick={openAdoImportModal}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-md transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Import from ADO
                  </button>
                )}
                {currentBoard.columns.some(c => c.type === 'ITEM_NO') && (
                  <button
                    onClick={openSnowImportModal}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-md transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Import from ServiceNow
                  </button>
                )}
                <button
                  onClick={() => setShowBoardExportModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-md transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <button
                  onClick={() => setShowColumnEditor(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-md transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Edit Columns
                </button>
              </div>
            </div>
            <TodoTable />
          </div>
        )}
        {activeTab === 'ai' && <AIExtractor />}
        {activeTab === 'docs' && <DocumentationTab />}
        {activeTab === 'settings' && (
          <div className="flex gap-8">
            {/* Sidebar */}
            <nav className="w-56 shrink-0 sticky top-6 self-start space-y-6">
              {settingsSections.map((section) => (
                <div key={section.label}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2 px-3">
                    {section.label}
                  </h4>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const isConnectorSubPage = activeSettingsPage.startsWith('connector:');
                      const isStudioSubPage = activeSettingsPage === 'studio';
                      const isActive = activeSettingsPage === item.id || (item.id === 'connectors' && isConnectorSubPage) || (item.id === 'appearance' && isStudioSubPage);
                      return (
                        <li key={item.id}>
                          {item.href ? (
                            <a
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full flex items-center gap-3 rounded-md py-2 px-3 text-sm transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-tertiary"
                            >
                              <item.icon className="w-4 h-4 shrink-0" />
                              {item.label}
                            </a>
                          ) : (
                            <button
                              onClick={() => setActiveSettingsPage(item.id)}
                              className={`w-full flex items-center gap-3 rounded-md py-2 px-3 text-sm transition-colors ${
                                isActive
                                  ? 'bg-primary-500/10 text-primary-500 font-medium'
                                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-tertiary'
                              }`}
                            >
                              <item.icon className="w-4 h-4 shrink-0" />
                              {item.label}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            {/* Content pane */}
            <div className="flex-1 min-w-0">
              {/* Appearance */}
              {activeSettingsPage === 'appearance' && (
                <div className="space-y-4">
                  <div className="bg-surface-secondary rounded-lg p-4 border border-border">
                    <h3 className="text-sm font-medium text-text-primary mb-3">
                      Default Themes
                    </h3>
                    <ThemePicker expanded />
                  </div>
                  <div className="bg-surface-secondary rounded-lg p-4 border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-text-primary">
                        Custom Themes
                      </h3>
                      <button
                        onClick={() => setShowThemeImport(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Import Theme
                      </button>
                    </div>
                    {customThemes.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {customThemes.map((ct) => (
                          <div
                            key={ct.id}
                            className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                              themeId === ct.id
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-border hover:border-primary-300'
                            }`}
                            onClick={() => setTheme(ct.id)}
                          >
                            <div
                              className="w-8 h-8 rounded-full"
                              style={{ backgroundColor: ct.colors['primary-500'] }}
                            />
                            <span className="text-xs text-text-secondary text-center truncate w-full">
                              {ct.name}
                            </span>
                            {themeId === ct.id && (
                              <Check className="absolute top-1 right-7 w-4 h-4 text-primary-500" />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCustomTheme(ct.id);
                              }}
                              className="absolute top-1 right-1 p-0.5 rounded text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete theme"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted text-center py-4">
                        No custom themes imported yet.
                      </p>
                    )}
                  </div>
                  <div
                    onClick={() => setActiveSettingsPage('studio')}
                    className="bg-surface-secondary rounded-lg border border-border p-4 flex items-center gap-4 cursor-pointer hover:border-primary-500/50 hover:bg-surface-tertiary transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0 group-hover:bg-primary-500/20 transition-colors">
                      <Wand2 className="w-5 h-5 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary group-hover:text-primary-500 transition-colors">
                        Theme Studio
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Create a custom theme with AI or hand-pick every color
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-text-muted rotate-180 shrink-0" />
                  </div>
                  <div className="bg-surface-secondary rounded-lg p-4 border border-border">
                    <h3 className="text-sm font-medium text-text-primary mb-3">
                      UI Customization
                    </h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">Show "New" badge on recent tasks</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showNewBadge}
                        onClick={() => setShowNewBadge(!showNewBadge)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                          showNewBadge ? 'bg-primary-500' : 'bg-border'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                            showNewBadge ? 'translate-x-[18px]' : 'translate-x-[3px]'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Keyboard Shortcuts Settings */}
              {activeSettingsPage === 'keyboard-shortcuts' && (
                <div className="space-y-4">
                  <div className="bg-surface-secondary rounded-lg p-4 border border-border">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-medium text-text-primary">Keyboard Shortcuts</h3>
                        <p className="text-xs text-text-muted mt-0.5">Customize key bindings to fit your workflow. Press Esc to cancel a capture.</p>
                      </div>
                      {Object.keys(shortcutOverrides).length > 0 && (
                        <button
                          onClick={resetAllShortcuts}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-md transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset all
                        </button>
                      )}
                    </div>

                    {(['Global', 'Board Navigation', 'Table Navigation', 'Task', 'AI'] as const).map((category) => {
                      const items = SHORTCUT_DEFS.filter((d) => d.category === category);
                      return (
                        <div key={category} className="mb-5 last:mb-0">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">{category}</h4>
                          <div className="space-y-1">
                            {items.map((def) => {
                              const canRebind = def.overridable !== false;
                              const key = shortcutOverrides[def.id] ?? def.defaultKey;
                              const isOverridden = !!shortcutOverrides[def.id];
                              return (
                                <div key={def.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                  <span className="text-sm text-text-primary">{def.description}</span>
                                  <div className="flex items-center gap-2">
                                    {!canRebind && (
                                      <span className="text-xs text-text-muted px-1.5 py-0.5 bg-surface-tertiary border border-border rounded">fixed</span>
                                    )}
                                    <kbd className="px-2 py-0.5 text-xs font-mono bg-surface-tertiary border border-border rounded text-text-secondary whitespace-nowrap">
                                      {formatKey(key)}
                                    </kbd>
                                    {canRebind && (
                                      <KeyCapture
                                        onCapture={(newKey) => setShortcutOverride(def.id, newKey)}
                                      />
                                    )}
                                    {canRebind && isOverridden && (
                                      <button
                                        onClick={() => resetShortcutOverride(def.id)}
                                        className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-surface-tertiary transition-colors"
                                        title="Reset to default"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Archive Settings */}
              {activeSettingsPage === 'archive' && (
                <ArchiveSettings />
              )}

              {/* Data */}
              {activeSettingsPage === 'data' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary mb-1">Export All Data</h3>
                    <p className="text-sm text-text-secondary mb-4">
                      Download a ZIP file containing all your boards, tasks, and column definitions.
                      Suitable for backups and migrating to a new installation.
                    </p>
                    <button
                      onClick={handleExportAll}
                      disabled={exportingAll}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                    >
                      {exportingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {exportingAll ? 'Preparing export…' : 'Download All Data'}
                    </button>
                    {exportAllError && (
                      <p className="text-sm text-red-500 mt-2">{exportAllError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Privacy Settings */}
              {activeSettingsPage === 'privacy' && (
                <PrivacySettings />
              )}

              {activeSettingsPage === 'updates' && (
                <UpdateSettings />
              )}

              {/* Wiki Settings */}
              {activeSettingsPage === 'wiki-settings' && (
                <DocumentationSettingsPanel />
              )}

              {/* Theme Studio */}
              {activeSettingsPage === 'studio' && (
                <ThemeStudio onClose={() => setActiveSettingsPage('appearance')} />
              )}

              {/* Connectors Overview */}
              {activeSettingsPage === 'connectors' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Installed Connectors</h3>
                    <button
                      onClick={() => setShowConnectorImport(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Install Connector
                    </button>
                  </div>
                  {connectorCategories.map((category) => (
                    <div key={category.label}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                        {category.label}
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {category.connectors.map((connector) => {
                          const IconComp = connector.icon;
                          return (
                            <div
                              key={connector.pageId}
                              onClick={() => setActiveSettingsPage(connector.pageId)}
                              className="flex items-start gap-3 p-4 bg-surface-secondary rounded-lg border border-border text-left group relative hover:border-primary-500/50 hover:bg-surface-tertiary cursor-pointer transition-colors"
                            >
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors bg-primary-500/10 group-hover:bg-primary-500/20">
                                <IconComp className="w-5 h-5 text-primary-500" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium transition-colors text-text-primary group-hover:text-primary-500">
                                  {connector.label}
                                </div>
                                <div className="text-xs text-text-muted mt-0.5 line-clamp-2">
                                  {connector.description}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <a
                    href="https://taskmesh.co/docs/what-is-a-connector"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 bg-surface-secondary rounded-lg border border-border cursor-pointer hover:border-primary-500/50 hover:bg-surface-tertiary transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0 group-hover:bg-primary-500/20 transition-colors">
                      <ExternalLink className="w-5 h-5 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary group-hover:text-primary-500 transition-colors">
                        Connector Documentation
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Learn what connectors are, how to install them, and how to build your own
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-text-muted shrink-0" />
                  </a>
                </div>
              )}

              {/* Dynamic Connector Settings Pages */}
              {activeSettingsPage.startsWith('connector:') && (() => {
                const parts = activeSettingsPage.split(':');
                const connectorId = parts[1];
                const instanceId = parts[2];
                const manifest = connectorManifests.find(m => m.id === connectorId);
                if (!manifest) return null;

                let componentName: string | undefined;
                if (manifest.multiInstance && instanceId) {
                  componentName =
                    manifest.settings.instanceSettingsComponents?.[instanceId] ||
                    manifest.settings.customSettingsComponent;
                } else {
                  componentName = manifest.settings.customSettingsComponent;
                }

                const SettingsComp = componentName ? getSettingsComponent(componentName) : null;
                const showExclusiveBanner = manifest.exclusiveActive;
                const showDocBanner = manifest.id === 'documentation';

                return (
                  <div className="space-y-4">
                    <button
                      onClick={() => setActiveSettingsPage('connectors')}
                      className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back to Connectors
                    </button>
                    <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
                      {showExclusiveBanner && (
                        <div className="px-4 py-2.5 text-sm bg-amber-50 text-amber-800 border-b border-amber-200">
                          Only one {manifest.category.toLowerCase()} connector may be active at a time.
                        </div>
                      )}
                      {showDocBanner && (
                        <div className="px-4 py-2.5 text-sm bg-amber-50 text-amber-800 border-b border-amber-200">
                          Documents are saved as Markdown files to the configured base path. Ensure the path is accessible from the server.
                        </div>
                      )}
                      {SettingsComp ? (
                        <SettingsComp />
                      ) : (
                        <div className="p-8 text-center text-text-secondary">
                          <p>No settings component registered for this connector.</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* API Keys */}
              {activeSettingsPage === 'api-keys' && (
                <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden p-4">
                  <ApiKeySettings />
                </div>
              )}

              {/* API Docs */}
              {activeSettingsPage === 'api-docs' && (
                <ApiDocsSettings />
              )}

              {/* Marketplace: Browse Connectors */}
              {activeSettingsPage === 'browse-connectors' && (
                <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
                  <MarketplacePlaceholder
                    title="Browse Connectors"
                    description="Discover and install community-built connectors for your favorite tools and services."
                  />
                </div>
              )}

              {/* Marketplace: Browse Themes */}
              {activeSettingsPage === 'browse-themes' && (
                <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
                  <MarketplacePlaceholder
                    title="Browse Themes"
                    description="Explore and install custom themes to personalize your TaskMesh experience."
                  />
                </div>
              )}

              {/* Marketplace: Browse Doc Templates */}
              {activeSettingsPage === 'browse-doc-templates' && (
                <div className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
                  <MarketplacePlaceholder
                    title="Browse Doc Templates"
                    description="Discover and install documentation templates to streamline your workflow."
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Board Export Modal */}
      {showBoardExportModal && currentBoard && (
        <ExportModal
          scope="board"
          board={currentBoard}
          onClose={() => setShowBoardExportModal(false)}
        />
      )}

      {/* Column Editor Modal */}
      {showColumnEditor && (
        <ColumnEditor onClose={() => setShowColumnEditor(false)} />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <KeyboardShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      {/* Global Search Modal */}
      {showSearchModal && (
        <GlobalSearchModal
          onClose={() => setShowSearchModal(false)}
          onNavigate={(boardId, taskId) => {
            setShowSearchModal(false);
            setActiveTab('tasks');
            setHighlightedTaskId(taskId);
            fetchBoard(boardId);
          }}
        />
      )}

      {/* Transcript Overlay */}
      <TranscriptOverlay />

      {/* ADO Push Modal */}
      <AdoPushModal />

      {/* ADO Import Modal */}
      <AdoImportModal />

      {/* ServiceNow Import Modal */}
      <SnowImportModal />

      {/* ServiceNow Push Modal */}
      <SnowPushModal />

      {/* Email Import Modal */}
      <EmailImportModal />

      {/* Email View Modal */}
      <EmailViewModal />

      {/* Document Viewer Modal */}
      <DocViewerModal />

      {/* Custom Theme Import Modal */}
      {showThemeImport && (
        <CustomThemeImport onClose={() => setShowThemeImport(false)} />
      )}

      {/* Connector Import Modal */}
      {showConnectorImport && (
        <ConnectorImport
          onClose={() => setShowConnectorImport(false)}
          onSuccess={refreshConnectors}
        />
      )}
    </div>
  );
}

export default App;
