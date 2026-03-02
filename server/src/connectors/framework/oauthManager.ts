import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ConnectorManifest, OAuthConfig, OAuthTokens } from './types.js';

// ──────────────────────────────────────────────
// Custom errors
// ──────────────────────────────────────────────

export class OAuthNotConnectedError extends Error {
  constructor(message = 'OAuth not connected') {
    super(message);
    this.name = 'OAuthNotConnectedError';
  }
}

export class OAuthTokenExpiredError extends Error {
  constructor(message = 'OAuth token expired and no refresh token available') {
    super(message);
    this.name = 'OAuthTokenExpiredError';
  }
}

// ──────────────────────────────────────────────
// Nonce store
// ──────────────────────────────────────────────

interface NonceEntry {
  connectorId: string;
  instanceId?: string;
  createdAt: number;
}

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const nonceStore = new Map<string, NonceEntry>();

function pruneExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, entry] of nonceStore.entries()) {
    if (now - entry.createdAt > NONCE_TTL_MS) {
      nonceStore.delete(nonce);
    }
  }
}

export function generateNonce(connectorId: string, instanceId?: string): string {
  pruneExpiredNonces();
  const nonce = randomBytes(32).toString('hex');
  nonceStore.set(nonce, { connectorId, instanceId, createdAt: Date.now() });
  return nonce;
}

export function validateAndConsumeNonce(state: string): NonceEntry | null {
  const entry = nonceStore.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > NONCE_TTL_MS) {
    nonceStore.delete(state);
    return null;
  }
  nonceStore.delete(state);
  return entry;
}

// ──────────────────────────────────────────────
// Authorization URL builder
// ──────────────────────────────────────────────

export function buildAuthorizationUrl(
  oauthConfig: OAuthConfig,
  clientId: string,
  state: string,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: oauthConfig.scopes.join(' '),
    state,
    ...oauthConfig.extraAuthParams,
  });
  return `${oauthConfig.authorizationUrl}?${params.toString()}`;
}

// ──────────────────────────────────────────────
// Token exchange
// ──────────────────────────────────────────────

export async function exchangeCodeForTokens(
  oauthConfig: OAuthConfig,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(oauthConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  return normalizeTokenResponse(data);
}

// ──────────────────────────────────────────────
// Token refresh (private)
// ──────────────────────────────────────────────

async function refreshAccessToken(
  oauthConfig: OAuthConfig,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(oauthConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json() as any;
  return normalizeTokenResponse(data);
}

function normalizeTokenResponse(data: any): OAuthTokens {
  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope,
  };
  if (data.refresh_token) {
    tokens.refreshToken = data.refresh_token;
  }
  if (data.expires_in) {
    tokens.expiresAt = Date.now() + Number(data.expires_in) * 1000;
  }
  return tokens;
}

// ──────────────────────────────────────────────
// Token storage helpers
// ──────────────────────────────────────────────

function configRowId(connectorId: string, instanceId?: string): string {
  return instanceId ? `${connectorId}_${instanceId}` : connectorId;
}

export async function storeOAuthTokens(
  prisma: PrismaClient,
  connectorId: string,
  tokens: OAuthTokens,
  instanceId?: string,
): Promise<void> {
  const id = configRowId(connectorId, instanceId);
  const existing = await (prisma as any).connectorConfig.findUnique({ where: { id } });
  const existingConfig: Record<string, any> = (existing?.config as Record<string, any>) ?? {};

  const newConfig = { ...existingConfig, _oauth: tokens };

  await (prisma as any).connectorConfig.upsert({
    where: { id },
    update: { config: newConfig },
    create: {
      id,
      connectorId,
      instanceId: instanceId || null,
      config: newConfig,
      enabled: true,
    },
  });
}

export async function getStoredOAuthTokens(
  prisma: PrismaClient,
  connectorId: string,
  instanceId?: string,
): Promise<OAuthTokens | null> {
  const id = configRowId(connectorId, instanceId);
  const row = await (prisma as any).connectorConfig.findUnique({ where: { id } });
  if (!row) return null;
  const config = (row.config as Record<string, any>) ?? {};
  return (config._oauth as OAuthTokens) ?? null;
}

export async function clearOAuthTokens(
  prisma: PrismaClient,
  connectorId: string,
  instanceId?: string,
): Promise<void> {
  const id = configRowId(connectorId, instanceId);
  const row = await (prisma as any).connectorConfig.findUnique({ where: { id } });
  if (!row) return;
  const config = { ...(row.config as Record<string, any>) ?? {} };
  delete config._oauth;
  await (prisma as any).connectorConfig.update({ where: { id }, data: { config } });
}

// ──────────────────────────────────────────────
// Get valid access token (auto-refresh)
// ──────────────────────────────────────────────

const EXPIRY_BUFFER_MS = 60 * 1000; // refresh if expires within 60s

export async function getValidAccessToken(
  prisma: PrismaClient,
  manifest: ConnectorManifest,
  instanceId?: string,
): Promise<string> {
  const tokens = await getStoredOAuthTokens(prisma, manifest.id, instanceId);
  if (!tokens?.accessToken) {
    throw new OAuthNotConnectedError();
  }

  if (tokens.expiresAt && tokens.expiresAt - Date.now() < EXPIRY_BUFFER_MS) {
    if (tokens.refreshToken && manifest.oauth) {
      const id = configRowId(manifest.id, instanceId);
      const row = await (prisma as any).connectorConfig.findUnique({ where: { id } });
      const config = (row?.config as Record<string, any>) ?? {};
      const clientId: string = config.clientId;
      const clientSecret: string = config.clientSecret;

      const refreshed = await refreshAccessToken(manifest.oauth, clientId, clientSecret, tokens.refreshToken);
      // Preserve refreshToken if not returned in refresh response
      if (!refreshed.refreshToken) {
        refreshed.refreshToken = tokens.refreshToken;
      }
      await storeOAuthTokens(prisma, manifest.id, refreshed, instanceId);
      return refreshed.accessToken;
    } else {
      throw new OAuthTokenExpiredError();
    }
  }

  return tokens.accessToken;
}

// ──────────────────────────────────────────────
// Safe status read (never returns token values)
// ──────────────────────────────────────────────

export async function getOAuthStatus(
  prisma: PrismaClient,
  connectorId: string,
  instanceId?: string,
): Promise<{ connected: boolean; scope?: string; expiresAt?: number }> {
  const tokens = await getStoredOAuthTokens(prisma, connectorId, instanceId);
  if (!tokens?.accessToken) {
    return { connected: false };
  }
  return {
    connected: true,
    scope: tokens.scope,
    expiresAt: tokens.expiresAt,
  };
}
