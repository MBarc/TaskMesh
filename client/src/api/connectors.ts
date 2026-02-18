import type { ConnectorManifest } from '../types/connector';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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

// ── Manifest Discovery ──

export async function getConnectorManifests(): Promise<ConnectorManifest[]> {
  return fetchAPI<ConnectorManifest[]>('/api/connectors');
}

// ── Generic Settings ──

export async function getConnectorSettings(
  connectorId: string,
  instanceId?: string,
): Promise<any> {
  const endpoint = instanceId
    ? `/api/${connectorId}/settings/${instanceId}`
    : `/api/${connectorId}/settings`;
  return fetchAPI(endpoint);
}

export async function saveConnectorSettings(
  connectorId: string,
  data: Record<string, any>,
  instanceId?: string,
): Promise<any> {
  const endpoint = instanceId
    ? `/api/${connectorId}/settings/${instanceId}`
    : `/api/${connectorId}/settings`;
  return fetchAPI(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ── Generic Actions ──

export async function testConnectorConnection(
  connectorId: string,
  instanceId?: string,
): Promise<{ success: boolean; message: string }> {
  const data = instanceId ? { instanceId } : undefined;
  return fetchAPI(`/api/${connectorId}/test-connection`, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function connectorSearch(
  connectorId: string,
  query: string,
): Promise<any[]> {
  return fetchAPI<any[]>(
    `/api/${connectorId}/search?query=${encodeURIComponent(query)}`,
  );
}

export async function connectorImport(
  connectorId: string,
  boardId: string,
  items: any[],
): Promise<{ columns: any[]; tasks: any[] }> {
  return fetchAPI(`/api/${connectorId}/import`, {
    method: 'POST',
    body: JSON.stringify({ boardId, items }),
  });
}

export async function connectorPush(
  connectorId: string,
  data: any,
): Promise<any> {
  return fetchAPI(`/api/${connectorId}/push`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function connectorGenerateField(
  connectorId: string,
  data: {
    taskId: string;
    fieldName: string;
    workItemType?: string;
    aiInstructions: string;
    title?: string;
  },
): Promise<{ content: string }> {
  return fetchAPI<{ content: string }>(`/api/${connectorId}/generate-field`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Generic call for connector-specific (custom) routes.
 * e.g. connectorAction('email', 'send-reply', { ... })
 *   => POST /api/email/send-reply
 */
export async function connectorAction<T = any>(
  connectorId: string,
  action: string,
  data?: any,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
): Promise<T> {
  const options: RequestInit = { method };
  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }
  return fetchAPI<T>(`/api/${connectorId}/${action}`, options);
}
