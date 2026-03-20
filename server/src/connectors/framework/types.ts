import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

// ──────────────────────────────────────────────
// OAuth types
// ──────────────────────────────────────────────

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  extraAuthParams?: Record<string, string>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;   // Unix ms
  scope?: string;
  tokenType?: string;
}

// ──────────────────────────────────────────────
// Manifest types (mirrors connector.json schema)
// ──────────────────────────────────────────────

export interface ManifestSettingsField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'password' | 'number' | 'checkbox' | 'textarea';
  required: boolean;
  secret?: boolean;
  placeholder?: string;
  normalize?: 'stripTrailingSlash';
  layout?: 'full' | 'half';
  default?: any;
}

export interface ManifestCustomField {
  key: string;
  type: 'json';
  label: string;
}

export interface ManifestColumn {
  type: string;
  name: string;
  requiredFor: string[];
}

export interface ManifestImport {
  label: string;
  searchPlaceholder?: string;
  itemLabel?: string;
  itemLabelPlural?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  customComponent?: string;
}

export interface ManifestPush {
  label: string;
  customComponent?: string;
}

export interface ManifestInstanceMeta {
  name: string;
  icon: string;
  brandColor: string;
}

export interface ConnectorManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  icon: string;
  category: string;
  brandColor: string;

  capabilities: string[];

  // Multi-instance support (e.g., email has outlook + gmail)
  multiInstance?: boolean;
  instanceKey?: string;
  instances?: string[];
  instanceMeta?: Record<string, ManifestInstanceMeta>;
  exclusiveActive?: boolean;

  columns: ManifestColumn[];

  settings: {
    singleton: boolean;
    fields: ManifestSettingsField[];
    customFields: ManifestCustomField[];
    customSettingsComponent?: string;
    instanceDefaults?: Record<string, Record<string, any>>;
  };

  import?: ManifestImport;
  push?: ManifestPush;
  aiFields?: { endpoint: string };
  oauth?: OAuthConfig;
}

// ──────────────────────────────────────────────
// Handler context (provided by framework)
// ──────────────────────────────────────────────

export interface ConnectorContext {
  prisma: PrismaClient;
  manifest: ConnectorManifest;
  /** Load raw settings (secrets unmasked) for this connector instance */
  getSettings(instanceId?: string): Promise<Record<string, any> | null>;
  /** Ensure a column of the given type exists on the board, returns the column */
  ensureColumn(boardId: string, columnType: string): Promise<any>;
  /**
   * Returns a valid access token for the connector instance.
   * Auto-refreshes if expired. Throws OAuthNotConnectedError or OAuthTokenExpiredError.
   */
  getOAuthToken(instanceId?: string): Promise<string>;
}

// ──────────────────────────────────────────────
// Handler interface (each connector implements)
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Standard connector errors
// ──────────────────────────────────────────────

export class ConnectorAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorAuthError';
  }
}

export interface ConnectorHandlers {
  /** Register connector-specific routes not covered by the standard CRUD */
  registerCustomRoutes?(router: Router, ctx: ConnectorContext): void;

  /** Test connectivity to the external service */
  testConnection?(ctx: ConnectorContext, instanceId?: string): Promise<{ success: boolean; message: string }>;

  /** Search the external service for items */
  search?(ctx: ConnectorContext, query: string, params?: Record<string, any>): Promise<any[]>;

  /** Import selected external items as board tasks */
  import?(ctx: ConnectorContext, boardId: string, items: any[]): Promise<{
    columns: any[];
    tasks: any[];
  }>;

  /** Push/create an item in the external service */
  push?(ctx: ConnectorContext, data: any): Promise<any>;

  /** Generate a field value using AI */
  generateField?(ctx: ConnectorContext, data: {
    taskId: string;
    fieldName: string;
    workItemType?: string;
    aiInstructions: string;
    title?: string;
  }): Promise<{ content: string }>;

  // Lifecycle hooks
  onSettingsSaved?(ctx: ConnectorContext, settings: Record<string, any>, instanceId?: string): Promise<void>;
  onInstall?(ctx: ConnectorContext): Promise<void>;
  onUninstall?(ctx: ConnectorContext): Promise<void>;
  onOAuthSuccess?(ctx: ConnectorContext, tokens: OAuthTokens, instanceId?: string): Promise<void>;
}
