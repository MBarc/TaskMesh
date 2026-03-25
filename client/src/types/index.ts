export type ColumnType = 'TEXT' | 'DROPDOWN' | 'MULTI_SELECT' | 'DATE' | 'CHECKBOX' | 'NUMBER' | 'SOURCE' | 'ADO_PUSH' | 'ITEM_NO' | 'SNOW_PUSH' | 'EMAIL' | 'DOCUMENTATION';

export type Platform = 'zoom' | 'teams' | 'google_meet' | 'slack' | 'webex' | 'ado' | 'servicenow' | 'outlook' | 'gmail' | 'api' | 'unknown';

export type EmailProvider = 'outlook' | 'gmail';

export interface SourceCellValue {
  platform: Platform;
  extractionId: string;
  taskTitle: string;
}

export interface AdoCellValue {
  workItemId: number;
  workItemUrl: string;
}

export type AdoFieldName = 'description' | 'acceptanceCriteria' | 'reproSteps';

export type AdoMetadataFieldName = 'priority' | 'effort' | 'severity' | 'tags';

export interface AdoFieldTemplate {
  defaultText: string;
  aiInstructions: string;
}

export interface AdoMetadataFieldTemplate {
  aiInstructions: string;
}

export type AdoWorkItemTemplates = Partial<Record<AdoFieldName, AdoFieldTemplate>>;
export type AdoMetadataTemplatesConfig = Partial<Record<AdoWorkItemType, Partial<Record<AdoMetadataFieldName, AdoMetadataFieldTemplate>>>>;
export type AdoTemplatesConfig = Partial<Record<AdoWorkItemType, AdoWorkItemTemplates>>;

export interface AdoSettings {
  organizationUrl: string;
  projectName: string;
  patConfigured: boolean;
  patMasked: string;
  assignedTo?: string;
  templates?: AdoTemplatesConfig;
  metadataTemplates?: AdoMetadataTemplatesConfig;
}

export type AdoWorkItemType = 'Epic' | 'Feature' | 'User Story' | 'Task' | 'Bug' | 'Issue' | 'Product Backlog Item';

export const ADO_WORK_ITEM_FIELDS: Record<AdoWorkItemType, AdoFieldName[]> = {
  'Epic': ['description'],
  'Feature': ['description'],
  'Product Backlog Item': ['description', 'acceptanceCriteria'],
  'User Story': ['description', 'acceptanceCriteria'],
  'Task': ['description'],
  'Bug': ['description', 'reproSteps', 'acceptanceCriteria'],
  'Issue': ['description'],
};

export const ADO_FIELD_LABELS: Record<AdoFieldName, string> = {
  description: 'Description',
  acceptanceCriteria: 'Acceptance Criteria',
  reproSteps: 'Repro Steps',
};

export const ADO_METADATA_FIELDS: Record<AdoWorkItemType, AdoMetadataFieldName[]> = {
  'Epic': ['priority', 'effort'],
  'Feature': ['priority', 'effort'],
  'Product Backlog Item': ['priority', 'effort'],
  'User Story': ['priority', 'effort'],
  'Task': ['priority', 'effort'],
  'Bug': ['priority', 'effort', 'severity'],
  'Issue': ['priority', 'effort'],
};

export const ADO_METADATA_FIELD_LABELS: Record<AdoMetadataFieldName, string> = {
  priority: 'Priority',
  effort: 'Effort / Story Points',
  severity: 'Severity',
  tags: 'Tags',
};

export interface EmailCellValue {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  provider: EmailProvider;
}

export interface EmailSettings {
  id: string;
  provider: EmailProvider;
  displayName: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  passwordConfigured: boolean;
  passwordMasked: string;
  pollingInterval: number;
  active: boolean;
  replyTemplate: string;
  signature: string;
}

export interface EmailQueueItem {
  id: string;
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  cc: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  receivedAt: string;
  classification: string | null;
  taskTitle: string | null;
  imported: boolean;
  boardId: string | null;
  provider: string;
  createdAt: string;
}

export interface EmailThreadMessage {
  id: string;
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  cc: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  receivedAt: string;
}

export interface SnowCellValue {
  sysId: string;
  ticketNumber: string;
  ticketUrl: string;
  closed: boolean;
}

export interface SnowPushCellValue {
  sysId: string;
  ticketNumber: string;
  ticketUrl: string;
}

export interface SnowSettings {
  instanceUrl: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  assignedTo?: string;
}

export interface SnowIncidentSearchResult {
  sysId: string;
  number: string;
  shortDescription: string;
  state: string;
  priority: string;
  assignedTo: string;
}

export interface AdoWorkItemSearchResult {
  id: number;
  title: string;
  workItemType: string;
  state: string;
}

export interface ColumnOption {
  id: string;
  columnId: string;
  value: string;
  color?: string;
  order: number;
}

export type ColumnAlignment = 'auto' | 'left' | 'center' | 'right';

export interface Column {
  id: string;
  boardId: string;
  name: string;
  type: ColumnType;
  order: number;
  requiredForCompletion: boolean;
  alignment: ColumnAlignment;
  options: ColumnOption[];
  createdAt: string;
}

export interface CellValue {
  id: string;
  taskId: string;
  columnId: string;
  value: string;
}

export interface Task {
  id: string;
  boardId: string;
  order: number;
  notes: string;
  cellValues: CellValue[];
  createdAt: string;
  updatedAt: string;
}

export interface Board {
  id: string;
  name: string;
  columns: Column[];
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface AIExtraction {
  id: string;
  boardId: string;
  sourceType: 'meeting_notes' | 'video';
  sourceText: string;
  extractedTasks: ExtractedTask[];
  status: 'pending_review' | 'completed';
  createdAt: string;
}

export interface ExtractedTask {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: string;
}

// API Keys
export type ApiKeyStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface ApiKey {
  id: string;
  name: string;
  maskedKey: string;
  status: ApiKeyStatus;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  usageCount: number;
  scopes: string[];
}

export interface CreateApiKeyRequest {
  name: string;
  expiresAt: string;
  scopes?: string[];
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  status: ApiKeyStatus;
  expiresAt: string;
  createdAt: string;
}

export interface ApiKeyUsageEntry {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  timestamp: string;
}

export interface ApiKeyHistoryResponse {
  entries: ApiKeyUsageEntry[];
  total: number;
  page: number;
  limit: number;
}

export type ThemeId = string;

export interface Theme {
  id: ThemeId;
  name: string;
  isDark: boolean;
  color: string;
}

// Archive types
export interface ArchiveSettings {
  archiveEnabled: boolean;
  archiveRetentionDays: number;
}

export interface ArchivedTaskSnapshotColumn {
  columnId: string;
  name: string;
  type: ColumnType;
  value: string;
  optionLabel?: string;
  optionColor?: string;
}

export interface ArchivedTaskSnapshot {
  columns: ArchivedTaskSnapshotColumn[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArchivedTask {
  id: string;
  originalTaskId: string;
  originalBoardId: string;
  originalBoardName: string;
  snapshot: ArchivedTaskSnapshot;
  archivedAt: string;
}

export interface ArchivedTaskGroup {
  boardId: string;
  boardName: string;
  boardStillExists: boolean;
  tasks: ArchivedTask[];
}

export interface ArchiveTasksResponse {
  groups: ArchivedTaskGroup[];
}

// Documentation types
export interface DocCellValue {
  filePath: string;
  fileName: string;
}

export interface DocumentationTemplate {
  id: string;
  name: string;
  content: string;
  namingConvention: string;
}

export interface DocumentationSettings {
  subfolder: string;
  localPath: string;
  templates: DocumentationTemplate[] | null;
}

export interface DocumentDraft {
  id: string;
  taskId: string;
  boardId: string;
  fileName: string;
  content: string;
  templateId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';
export type NotificationSource = 'local' | 'broadcast';

export interface Notification {
  id: string;
  source: NotificationSource;
  broadcastId: string | null;
  title: string;
  message: string;
  severity: NotificationSeverity;
  read: boolean;
  dismissed: boolean;
  createdAt: string;
}

// Wiki (Documentation File Explorer) types
export interface DocFileStub {
  id: string;
  boardId: string;
  name: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocFile extends DocFileStub {
  content: string;
  folder?: { id: string; name: string; parentFolderId: string | null; parentFolder?: { name: string } | null } | null;
}

export interface DocFolder {
  id: string;
  boardId: string;
  name: string;
  parentFolderId: string | null;
  subfolders: DocFolder[];
  files: DocFileStub[];
  createdAt: string;
  updatedAt: string;
}

export interface DocTree {
  folders: DocFolder[];
  files: DocFileStub[];
}

export type TranscriptionJobStatus = 'queued' | 'transcribing' | 'extracting' | 'done' | 'error' | 'cancelled';

export interface TranscriptionJob {
  id: string;
  status: TranscriptionJobStatus;
  fileName: string;
  fileSize: number;
  transcript: string | null;
  errorMessage: string | null;
  extractionId: string | null;
  createdAt: string;
}
