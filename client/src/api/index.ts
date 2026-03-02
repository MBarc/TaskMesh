import type { Board, Column, Task, ColumnType, ExtractedTask, AIExtraction, Platform, AdoSettings, AdoWorkItemType, AdoWorkItemSearchResult, AdoTemplatesConfig, AdoMetadataTemplatesConfig, SnowSettings, SnowIncidentSearchResult, EmailSettings, EmailQueueItem, EmailThreadMessage, EmailProvider, ApiKey, CreateApiKeyRequest, CreateApiKeyResponse, ApiKeyHistoryResponse, DocumentationSettings, DocumentDraft, DocumentationTemplate, ArchiveSettings, ArchiveTasksResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Board API
export async function getBoards(): Promise<Board[]> {
  return fetchAPI<Board[]>('/api/boards');
}

export async function getBoard(id: string): Promise<Board> {
  return fetchAPI<Board>(`/api/boards/${id}`);
}

export async function createBoard(name: string): Promise<Board> {
  return fetchAPI<Board>('/api/boards', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updateBoard(id: string, name: string): Promise<Board> {
  return fetchAPI<Board>(`/api/boards/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function deleteBoard(id: string): Promise<void> {
  return fetchAPI<void>(`/api/boards/${id}`, {
    method: 'DELETE',
  });
}

// Column API
export async function addColumn(
  boardId: string,
  name: string,
  type: ColumnType,
  options?: { value: string; color?: string }[]
): Promise<Column> {
  return fetchAPI<Column>(`/api/columns/boards/${boardId}/columns`, {
    method: 'POST',
    body: JSON.stringify({ name, type, options }),
  });
}

export async function updateColumn(
  columnId: string,
  name: string,
  options?: { value: string; color?: string }[],
  requiredForCompletion?: boolean
): Promise<Column> {
  return fetchAPI<Column>(`/api/columns/${columnId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, options, requiredForCompletion }),
  });
}

export async function deleteColumn(columnId: string): Promise<void> {
  return fetchAPI<void>(`/api/columns/${columnId}`, {
    method: 'DELETE',
  });
}

export async function reorderColumns(boardId: string, columnIds: string[]): Promise<Column[]> {
  return fetchAPI<Column[]>(`/api/columns/boards/${boardId}/columns/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ columnIds }),
  });
}

// Task API
export async function addTask(
  boardId: string,
  cellValues?: Record<string, string>
): Promise<Task> {
  return fetchAPI<Task>(`/api/tasks/boards/${boardId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ cellValues }),
  });
}

export async function updateTask(
  taskId: string,
  cellValues: Record<string, string>
): Promise<Task> {
  return fetchAPI<Task>(`/api/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ cellValues }),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  return fetchAPI<void>(`/api/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export async function reorderTasks(boardId: string, taskIds: string[]): Promise<Task[]> {
  return fetchAPI<Task[]>(`/api/tasks/boards/${boardId}/tasks/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ taskIds }),
  });
}

export async function bulkCreateTasks(
  boardId: string,
  tasks: { cellValues: Record<string, string> }[]
): Promise<Task[]> {
  return fetchAPI<Task[]>(`/api/tasks/boards/${boardId}/tasks/bulk`, {
    method: 'POST',
    body: JSON.stringify({ tasks }),
  });
}

// AI API
export async function extractTasksFromNotes(
  boardId: string,
  text: string,
  targetIndividual?: string
): Promise<{ extractionId: string; tasks: ExtractedTask[]; platform: Platform }> {
  return fetchAPI('/api/ai/extract-from-notes', {
    method: 'POST',
    body: JSON.stringify({ boardId, text, targetIndividual }),
  });
}

export async function transcribeVideo(
  boardId: string,
  file: File
): Promise<{ extractionId: string; transcript: string; tasks: ExtractedTask[]; platform: Platform }> {
  const formData = new FormData();
  formData.append('video', file);
  formData.append('boardId', boardId);

  const response = await fetch(`${API_URL}/api/ai/transcribe-video`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

export async function completeExtraction(extractionId: string): Promise<void> {
  return fetchAPI<void>(`/api/ai/extractions/${extractionId}/complete`, {
    method: 'PUT',
  });
}

export async function getExtraction(extractionId: string): Promise<AIExtraction & { platform: Platform }> {
  return fetchAPI(`/api/ai/extraction/${extractionId}`);
}

export async function ensureSourceColumn(boardId: string): Promise<Column> {
  return fetchAPI<Column>(`/api/columns/boards/${boardId}/columns/ensure-source`, {
    method: 'POST',
  });
}

// ADO API
export async function getAdoSettings(): Promise<AdoSettings | null> {
  return fetchAPI<AdoSettings | null>('/api/ado/settings');
}

export async function saveAdoSettings(data: {
  organizationUrl: string;
  projectName: string;
  pat: string;
  assignedTo?: string;
  templates?: AdoTemplatesConfig;
  metadataTemplates?: AdoMetadataTemplatesConfig;
}): Promise<AdoSettings> {
  return fetchAPI<AdoSettings>('/api/ado/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function testAdoConnection(): Promise<{ success: boolean; message: string }> {
  return fetchAPI('/api/ado/test-connection', {
    method: 'POST',
  });
}

export async function searchAdoWorkItems(query: string): Promise<AdoWorkItemSearchResult[]> {
  return fetchAPI<AdoWorkItemSearchResult[]>(`/api/ado/search-work-items?query=${encodeURIComponent(query)}`);
}

export async function searchAdoTags(query: string): Promise<{ name: string }[]> {
  return fetchAPI<{ name: string }[]>(`/api/ado/tags?query=${encodeURIComponent(query)}`);
}

export async function pushToAdo(data: {
  taskId: string;
  columnId: string;
  title: string;
  workItemType: AdoWorkItemType;
  parentWorkItemId: number;
  description?: string;
  acceptanceCriteria?: string;
  reproSteps?: string;
  priority?: number;
  effort?: number;
  severity?: string;
  tags?: string;
}): Promise<Task> {
  return fetchAPI<Task>('/api/ado/push-work-item', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function generateAdoField(data: {
  taskId: string;
  fieldName: string;
  workItemType: AdoWorkItemType;
  aiInstructions: string;
  title?: string;
}): Promise<{ content: string }> {
  return fetchAPI<{ content: string }>('/api/ado/generate-field', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function searchAdoAssignedWorkItems(query?: string): Promise<AdoWorkItemSearchResult[]> {
  const params = query?.trim() ? `?query=${encodeURIComponent(query)}` : '';
  return fetchAPI<AdoWorkItemSearchResult[]>(`/api/ado/search-work-items-assigned${params}`);
}

export async function importAdoWorkItems(boardId: string, workItems: AdoWorkItemSearchResult[]): Promise<{ column: Column; itemNoColumn?: Column; tasks: Task[] }> {
  return fetchAPI<{ column: Column; itemNoColumn?: Column; tasks: Task[] }>('/api/ado/import-work-items', {
    method: 'POST',
    body: JSON.stringify({ boardId, workItems }),
  });
}

export async function ensureAdoColumn(boardId: string): Promise<Column> {
  return fetchAPI<Column>(`/api/columns/boards/${boardId}/columns/ensure-ado`, {
    method: 'POST',
  });
}

export async function removeAdoColumn(boardId: string): Promise<void> {
  return fetchAPI<void>(`/api/columns/boards/${boardId}/columns/ado`, {
    method: 'DELETE',
  });
}

// ServiceNow API
export async function getSnowSettings(): Promise<SnowSettings | null> {
  return fetchAPI<SnowSettings | null>('/api/snow/settings');
}

export async function saveSnowSettings(data: {
  instanceUrl: string;
  apiKey: string;
  assignedTo?: string;
}): Promise<SnowSettings> {
  return fetchAPI<SnowSettings>('/api/snow/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function testSnowConnection(): Promise<{ success: boolean; message: string }> {
  return fetchAPI('/api/snow/test-connection', {
    method: 'POST',
  });
}

export async function searchSnowIncidents(query?: string): Promise<SnowIncidentSearchResult[]> {
  const params = query?.trim() ? `?query=${encodeURIComponent(query)}` : '';
  return fetchAPI<SnowIncidentSearchResult[]>(`/api/snow/search-incidents${params}`);
}

export async function importSnowIncidents(boardId: string, incidents: SnowIncidentSearchResult[]): Promise<{ column: Column; tasks: Task[] }> {
  return fetchAPI<{ column: Column; tasks: Task[] }>('/api/snow/import-incidents', {
    method: 'POST',
    body: JSON.stringify({ boardId, incidents }),
  });
}

export async function closeSnowIncident(taskId: string, columnId: string, sysId: string): Promise<Task> {
  return fetchAPI<Task>('/api/snow/close-incident', {
    method: 'POST',
    body: JSON.stringify({ taskId, columnId, sysId }),
  });
}

export async function pushToSnow(data: {
  taskId: string;
  columnId: string;
  short_description: string;
  description?: string;
  caller_id?: string;
  category?: string;
  subcategory?: string;
  urgency?: string;
  impact?: string;
  assignment_group?: string;
  assigned_to?: string;
  contact_type?: string;
  cmdb_ci?: string;
}): Promise<Task> {
  return fetchAPI<Task>('/api/snow/push-incident', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function addSnowComment(data: {
  sysId: string;
  comment: string;
}): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>('/api/snow/add-comment', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getSnowIncident(sysId: string): Promise<{
  sysId: string;
  number: string;
  shortDescription: string;
  description: string;
  callerId: string;
  category: string;
  subcategory: string;
  urgency: string;
  impact: string;
  priority: string;
  assignmentGroup: string;
  assignedTo: string;
  contactType: string;
  configurationItem: string;
  state: string;
}> {
  return fetchAPI('/api/snow/get-incident', {
    method: 'POST',
    body: JSON.stringify({ sysId }),
  });
}

export async function generateSnowField(data: {
  taskId: string;
  fieldName: string;
  aiInstructions: string;
  title?: string;
}): Promise<{ content: string }> {
  return fetchAPI<{ content: string }>('/api/snow/generate-field', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function ensureSnowPushColumn(boardId: string): Promise<Column> {
  return fetchAPI<Column>(`/api/columns/boards/${boardId}/columns/ensure-snow-push`, {
    method: 'POST',
  });
}

export async function removeSnowPushColumn(boardId: string): Promise<void> {
  return fetchAPI<void>(`/api/columns/boards/${boardId}/columns/snow-push`, {
    method: 'DELETE',
  });
}

export async function ensureItemNoColumn(boardId: string): Promise<Column> {
  return fetchAPI<Column>(`/api/columns/boards/${boardId}/columns/ensure-item-no`, {
    method: 'POST',
  });
}

export async function removeItemNoColumn(boardId: string): Promise<void> {
  return fetchAPI<void>(`/api/columns/boards/${boardId}/columns/item-no`, {
    method: 'DELETE',
  });
}

// Email API
export async function getEmailSettings(provider: EmailProvider): Promise<EmailSettings | null> {
  return fetchAPI<EmailSettings | null>(`/api/email/settings/${provider}`);
}

export async function saveEmailSettings(data: {
  provider: EmailProvider;
  displayName: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  pollingInterval: number;
  active: boolean;
  replyTemplate?: string;
  signature?: string;
}): Promise<EmailSettings> {
  return fetchAPI<EmailSettings>('/api/email/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function testEmailConnection(): Promise<{ success: boolean; message: string }> {
  return fetchAPI('/api/email/test-connection', {
    method: 'POST',
  });
}

export async function getEmailQueue(): Promise<EmailQueueItem[]> {
  return fetchAPI<EmailQueueItem[]>('/api/email/queue');
}

export async function refreshEmailQueue(): Promise<{ fetched: number }> {
  return fetchAPI<{ fetched: number }>('/api/email/refresh', {
    method: 'POST',
  });
}

export async function importEmails(boardId: string, emailIds: string[]): Promise<{ column: Column; tasks: Task[] }> {
  return fetchAPI<{ column: Column; tasks: Task[] }>('/api/email/import-emails', {
    method: 'POST',
    body: JSON.stringify({ boardId, emailIds }),
  });
}

export async function sendEmailReply(data: {
  taskId: string;
  columnId: string;
  replyAll: boolean;
  body: string;
}): Promise<{ success: boolean; message: string }> {
  return fetchAPI('/api/email/send-reply', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function generateEmailReply(taskId: string, columnId: string): Promise<{ content: string }> {
  return fetchAPI<{ content: string }>('/api/email/generate-reply', {
    method: 'POST',
    body: JSON.stringify({ taskId, columnId }),
  });
}

export async function getEmailThread(threadId: string): Promise<EmailThreadMessage[]> {
  return fetchAPI<EmailThreadMessage[]>(`/api/email/thread/${encodeURIComponent(threadId)}`);
}

export async function ensureEmailColumn(boardId: string): Promise<Column> {
  return fetchAPI<Column>(`/api/columns/boards/${boardId}/columns/ensure-email`, {
    method: 'POST',
  });
}

export async function removeEmailColumn(boardId: string): Promise<void> {
  return fetchAPI<void>(`/api/columns/boards/${boardId}/columns/email`, {
    method: 'DELETE',
  });
}

// API Keys
export async function getApiKeys(): Promise<ApiKey[]> {
  return fetchAPI<ApiKey[]>('/api/api-keys');
}

export async function createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return fetchAPI<CreateApiKeyResponse>('/api/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  return fetchAPI<void>(`/api/api-keys/${id}`, {
    method: 'DELETE',
  });
}

export async function getApiKeyHistory(id: string, page = 1, limit = 50): Promise<ApiKeyHistoryResponse> {
  return fetchAPI<ApiKeyHistoryResponse>(`/api/api-keys/${id}/history?page=${page}&limit=${limit}`);
}

// Documentation API
export async function getDocumentationSettings(): Promise<DocumentationSettings | null> {
  return fetchAPI<DocumentationSettings | null>('/api/documentation/settings');
}

export async function saveDocumentationSettings(data: {
  subfolder: string;
  templates?: DocumentationTemplate[] | null;
  customVariables?: { name: string; description: string }[] | null;
}): Promise<DocumentationSettings> {
  return fetchAPI<DocumentationSettings>('/api/documentation/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function saveDocument(data: {
  taskId: string;
  boardId: string;
  columnId: string;
  fileName: string;
  content: string;
}): Promise<Task> {
  return fetchAPI<Task>('/api/documentation/save-document', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function saveDocumentDraft(data: {
  taskId: string;
  boardId: string;
  fileName: string;
  content: string;
  templateId?: string;
}): Promise<DocumentDraft> {
  return fetchAPI<DocumentDraft>('/api/documentation/save-draft', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getDocumentDraft(taskId: string): Promise<DocumentDraft | null> {
  return fetchAPI<DocumentDraft | null>(`/api/documentation/draft/${taskId}`);
}

export async function readDocument(filePath: string): Promise<{ content: string; filePath: string }> {
  return fetchAPI<{ content: string; filePath: string }>('/api/documentation/read-document', {
    method: 'POST',
    body: JSON.stringify({ filePath }),
  });
}

export async function importDocumentationTemplates(
  templates: { fileName: string; content: string }[]
): Promise<{ imported: number; newVariables: number; templates: DocumentationTemplate[]; customVariables: { name: string; description: string }[] }> {
  return fetchAPI('/api/documentation/import-templates', {
    method: 'POST',
    body: JSON.stringify({ templates }),
  });
}

export async function ensureDocumentationColumn(boardId: string): Promise<Column> {
  return fetchAPI<Column>(`/api/columns/boards/${boardId}/columns/ensure-documentation`, {
    method: 'POST',
  });
}

export async function removeDocumentationColumn(boardId: string): Promise<void> {
  return fetchAPI<void>(`/api/columns/boards/${boardId}/columns/documentation`, {
    method: 'DELETE',
  });
}

export async function rewordText(text: string, context?: string): Promise<{ content: string }> {
  return fetchAPI<{ content: string }>('/api/ai/reword', {
    method: 'POST',
    body: JSON.stringify({ text, context }),
  });
}

export async function generateSection(data: {
  sectionName: string;
  templateContext?: string;
  taskContext?: string;
}): Promise<{ content: string }> {
  return fetchAPI<{ content: string }>('/api/ai/generate-section', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function generateThemeColors(prompt: string): Promise<{ isDark: boolean; colors: Record<string, string> }> {
  return fetchAPI<{ isDark: boolean; colors: Record<string, string> }>('/api/ai/generate-theme', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

// Archive API
export async function getArchiveSettings(): Promise<ArchiveSettings> {
  return fetchAPI<ArchiveSettings>('/api/archive/settings');
}

export async function updateArchiveSettings(data: Partial<ArchiveSettings>): Promise<ArchiveSettings> {
  return fetchAPI<ArchiveSettings>('/api/archive/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getArchivedTasks(): Promise<ArchiveTasksResponse> {
  return fetchAPI<ArchiveTasksResponse>('/api/archive/tasks');
}

export async function restoreArchivedTask(id: string): Promise<Task> {
  return fetchAPI<Task>(`/api/archive/tasks/${id}/restore`, {
    method: 'POST',
  });
}

export async function deleteArchivedTask(id: string): Promise<void> {
  return fetchAPI<void>(`/api/archive/tasks/${id}`, {
    method: 'DELETE',
  });
}

// ── Connector SDK API ──
// Generic connector functions for the Connector SDK.
// Per-connector functions above are kept for backward compatibility.
export {
  getConnectorManifests,
  getConnectorSettings,
  saveConnectorSettings,
  testConnectorConnection,
  connectorSearch,
  connectorImport,
  connectorPush,
  connectorGenerateField,
  connectorAction,
} from './connectors';
