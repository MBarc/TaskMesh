import { useState, useEffect, useCallback } from 'react';
import { useBoardStore } from './stores/boardStore';
import { useThemeStore } from './stores/themeStore';
import { useUiPrefsStore } from './stores/uiPrefsStore';
import { BoardSelector } from './components/BoardSelector';
import { TodoTable } from './components/TodoTable';
import { AIExtractor } from './components/AIExtractor';
import { ThemePicker } from './components/ThemePicker';
import { ColumnEditor } from './components/ColumnEditor';
import { TranscriptOverlay } from './components/TranscriptOverlay';
import { ApiKeySettings } from './components/ApiKeySettings';
import { ApiDocsSettings } from './components/ApiDocsSettings';
import { DocumentationPage } from './components/DocumentationPage';
import { DocumentationTab } from './components/DocumentationTab';
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
import { ArchiveBoard } from './components/ArchiveBoard';
import { getSettingsComponent, getConnectorIcon } from './components/connectors/registry';
import { getConnectorManifests } from './api/connectors';
import type { ConnectorManifest } from './types/connector';
import { ListTodo, Sparkles, Settings, Download, Mail, Paintbrush, Key, BookOpen, Store, Palette, Plug, ChevronLeft, FileText, Upload, Trash2, Check, Wand2, Archive, ExternalLink } from 'lucide-react';
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

function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('taskmesh_activeTab');
    return (saved === 'tasks' || saved === 'ai' || saved === 'docs' || saved === 'settings') ? saved : 'tasks';
  });
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage>('appearance');
  const { currentBoard, isArchiveView, fetchBoards, openAdoImportModal, openSnowImportModal, openEmailImportModal, emailImportModal, documentationPage, updateBoard } = useBoardStore();
  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');
  const [showThemeImport, setShowThemeImport] = useState(false);
  const [showConnectorImport, setShowConnectorImport] = useState(false);
  const themeId = useThemeStore((state) => state.themeId);
  const customThemes = useThemeStore((state) => state.customThemes);
  const setTheme = useThemeStore((state) => state.setTheme);
  const removeCustomTheme = useThemeStore((state) => state.removeCustomTheme);
  const showNewBadge = useUiPrefsStore((s) => s.showNewBadge);
  const setShowNewBadge = useUiPrefsStore((s) => s.setShowNewBadge);
  const [emailQueueCount, setEmailQueueCount] = useState(0);
  const [connectorManifests, setConnectorManifests] = useState<ConnectorManifest[]>([]);

  const emailColumnEnabled = currentBoard?.columns.some(c => c.type === 'EMAIL') ?? false;

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

  // Re-fetch count when import modal closes (user may have imported some)
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

  const tabs = [
    { id: 'tasks' as Tab, label: 'Tasks', icon: ListTodo },
    { id: 'ai' as Tab, label: 'Smart Extract', icon: Sparkles },
    { id: 'docs' as Tab, label: 'Documentation', icon: FileText },
    { id: 'settings' as Tab, label: 'Settings', icon: Settings },
  ];

  type SettingsItem = { id: SettingsPage; label: string; icon: typeof Paintbrush; href?: string };
  type SettingsSection = { label: string; items: SettingsItem[] };

  const settingsSections: SettingsSection[] = [
    {
      label: 'General',
      items: [
        { id: 'appearance', label: 'Appearance', icon: Paintbrush },
        { id: 'archive', label: 'Archive', icon: Archive },
        { id: 'connectors', label: 'Connectors', icon: Plug },
      ],
    },
    {
      label: 'Help',
      items: [
        { id: 'how-to', label: 'How-to Guides', icon: ExternalLink, href: 'https://taskmesh.co/docs' },
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
        { id: 'browse-connectors', label: 'Browse Connectors', icon: Store },
        { id: 'browse-themes', label: 'Browse Themes', icon: Palette },
        { id: 'browse-doc-templates', label: 'Browse Doc Templates', icon: FileText },
      ],
    },
  ];

  // Build connector categories dynamically from manifests
  type ConnectorCardDef = { pageId: string; label: string; icon: typeof Plug; description: string; brandColor: string };
  type ConnectorCategory = { label: string; connectors: ConnectorCardDef[] };

  const connectorCategories: ConnectorCategory[] = (() => {
    const categoryMap = new Map<string, ConnectorCardDef[]>();

    for (const m of connectorManifests) {
      const cards: ConnectorCardDef[] = [];

      if (m.multiInstance && m.instances && m.instanceMeta) {
        // Multi-instance connector: create a card per instance
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
        // Single-instance connector
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
      {/* Header */}
      <header className="bg-surface-secondary border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-text-primary">TaskMesh <span className="text-xs font-normal text-text-secondary">All Your Work. One Place.</span></h1>
              <BoardSelector />
            </div>
            <ThemePicker />
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
                      // Check if this item or any of its sub-pages is active
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

              {/* Archive Settings */}
              {activeSettingsPage === 'archive' && (
                <ArchiveSettings />
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

                  {/* Documentation link */}
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
                const instanceId = parts[2]; // undefined for single-instance
                const manifest = connectorManifests.find(m => m.id === connectorId);
                if (!manifest) return null;

                // Resolve the settings component name
                let componentName: string | undefined;
                if (manifest.multiInstance && instanceId) {
                  // Multi-instance: check per-instance components first, then shared
                  componentName =
                    manifest.settings.instanceSettingsComponents?.[instanceId] ||
                    manifest.settings.customSettingsComponent;
                } else {
                  componentName = manifest.settings.customSettingsComponent;
                }

                const SettingsComp = componentName ? getSettingsComponent(componentName) : null;

                // Show banners for specific connectors
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

      {/* Column Editor Modal */}
      {showColumnEditor && (
        <ColumnEditor onClose={() => setShowColumnEditor(false)} />
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
