import { Request, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ConnectorManifest, ConnectorHandlers, ConnectorContext } from './types.js';
import { getSettings, saveSettings, getRawSettings, SettingsValidationError } from './settingsManager.js';
import { ensureColumn } from './columnManager.js';
import { generateFieldFromTask } from './aiFieldGenerator.js';
import {
  generateNonce,
  validateAndConsumeNonce,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  storeOAuthTokens,
  clearOAuthTokens,
  getOAuthStatus,
  getValidAccessToken,
} from './oauthManager.js';

/**
 * Build the OAuth redirect URI from a request.
 * Uses x-forwarded-proto/host headers if present (reverse proxy support).
 * instanceId is NOT included — it round-trips through the state nonce.
 */
function buildRedirectUri(req: Request, connectorId: string): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}/api/${connectorId}/auth/callback`;
}

/**
 * Create a ConnectorContext for a given manifest + prisma client.
 */
export function createConnectorContext(
  prisma: PrismaClient,
  manifest: ConnectorManifest,
): ConnectorContext {
  return {
    prisma,
    manifest,
    getSettings: (instanceId?: string) => getRawSettings(prisma, manifest, instanceId),
    ensureColumn: (boardId: string, columnType: string) => {
      const colDef = manifest.columns.find(c => c.type === columnType);
      const name = colDef?.name || columnType;
      return ensureColumn(prisma, boardId, columnType, name);
    },
    getOAuthToken: (instanceId?: string) => getValidAccessToken(prisma, manifest, instanceId),
  };
}

/**
 * Build an Express Router from a connector manifest + handlers.
 * Auto-generates standard routes based on declared capabilities.
 */
export function buildConnectorRouter(
  manifest: ConnectorManifest,
  handlers: ConnectorHandlers,
  prisma: PrismaClient,
): Router {
  const router = Router();
  const ctx = createConnectorContext(prisma, manifest);
  const caps = new Set(manifest.capabilities);

  // ── Settings CRUD ──
  if (caps.has('settings')) {
    if (manifest.multiInstance) {
      // Multi-instance: GET /settings/:instanceId
      router.get('/settings/:instanceId', async (req, res) => {
        try {
          const { instanceId } = req.params;
          if (manifest.instances && manifest.instances.length > 0 && !manifest.instances.includes(instanceId)) {
            return res.status(400).json({ error: `Invalid instance: ${instanceId}` });
          }
          const result = await getSettings(prisma, manifest, instanceId);
          res.json(result);
        } catch (error: any) {
          console.error(`Error fetching ${manifest.name} settings:`, error);
          res.status(500).json({ error: `Failed to fetch ${manifest.name} settings` });
        }
      });
    } else {
      // Singleton: GET /settings
      router.get('/settings', async (req, res) => {
        try {
          const result = await getSettings(prisma, manifest);
          res.json(result);
        } catch (error: any) {
          console.error(`Error fetching ${manifest.name} settings:`, error);
          res.status(500).json({ error: `Failed to fetch ${manifest.name} settings` });
        }
      });
    }

    // PUT /settings (works for both singleton and multi-instance)
    router.put('/settings', async (req, res) => {
      try {
        const data = req.body;
        const instanceId = manifest.multiInstance
          ? data[manifest.instanceKey || 'instanceId'] || data.instanceId
          : undefined;

        if (manifest.multiInstance && manifest.instances && instanceId && !manifest.instances.includes(instanceId)) {
          return res.status(400).json({ error: `Invalid instance: ${instanceId}` });
        }

        const result = await saveSettings(prisma, manifest, data, instanceId);

        // Lifecycle hook
        if (handlers.onSettingsSaved) {
          const raw = await getRawSettings(prisma, manifest, instanceId);
          if (raw) {
            await handlers.onSettingsSaved(ctx, raw, instanceId);
          }
        }

        res.json(result);
      } catch (error: any) {
        if (error instanceof SettingsValidationError) {
          return res.status(400).json({ error: error.message });
        }
        console.error(`Error saving ${manifest.name} settings:`, error);
        res.status(500).json({ error: `Failed to save ${manifest.name} settings` });
      }
    });
  }

  // ── Test Connection ──
  if (caps.has('test-connection') && handlers.testConnection) {
    router.post('/test-connection', async (req, res) => {
      try {
        const instanceId = manifest.multiInstance ? req.body.instanceId : undefined;
        const result = await handlers.testConnection!(ctx, instanceId);
        res.json(result);
      } catch (error: any) {
        console.error(`Error testing ${manifest.name} connection:`, error);
        res.json({ success: false, message: `Connection test failed: ${error.message}` });
      }
    });
  }

  // ── Search ──
  if (caps.has('search') && handlers.search) {
    router.get('/search', async (req, res) => {
      try {
        const query = (req.query.query as string) || '';
        const results = await handlers.search!(ctx, query, req.query as Record<string, any>);
        res.json(results);
      } catch (error: any) {
        console.error(`Error searching ${manifest.name}:`, error);
        res.status(500).json({ error: `Search failed: ${error.message}` });
      }
    });
  }

  // ── Import ──
  if (caps.has('import') && handlers.import) {
    router.post('/import', async (req, res) => {
      try {
        const { boardId, items } = req.body;
        if (!boardId || !items?.length) {
          return res.status(400).json({ error: 'boardId and items are required' });
        }
        const result = await handlers.import!(ctx, boardId, items);
        res.json(result);
      } catch (error: any) {
        console.error(`Error importing from ${manifest.name}:`, error);
        res.status(500).json({ error: `Import failed: ${error.message}` });
      }
    });
  }

  // ── Push ──
  if (caps.has('push') && handlers.push) {
    router.post('/push', async (req, res) => {
      try {
        const result = await handlers.push!(ctx, req.body);
        res.json(result);
      } catch (error: any) {
        console.error(`Error pushing to ${manifest.name}:`, error);
        res.status(500).json({ error: `Push failed: ${error.message}` });
      }
    });
  }

  // ── OAuth ──
  if (caps.has('oauth') && manifest.oauth) {
    const oauthConfig = manifest.oauth;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // GET /auth/start — redirect user to provider authorization page
    router.get('/auth/start', async (req, res) => {
      try {
        const instanceId = manifest.multiInstance
          ? (req.query.instanceId as string | undefined)
          : undefined;

        const settings = await getRawSettings(prisma, manifest, instanceId);
        if (!settings?.clientId || !settings?.clientSecret) {
          return res.status(400).json({ error: 'clientId and clientSecret must be configured before starting OAuth' });
        }

        const state = generateNonce(manifest.id, instanceId);
        const redirectUri = buildRedirectUri(req, manifest.id);
        const authUrl = buildAuthorizationUrl(oauthConfig, settings.clientId, state, redirectUri);
        res.redirect(authUrl);
      } catch (error: any) {
        console.error(`OAuth start error for ${manifest.name}:`, error);
        res.status(500).json({ error: `Failed to start OAuth: ${error.message}` });
      }
    });

    // GET /auth/callback — handle provider redirect with authorization code
    router.get('/auth/callback', async (req, res) => {
      const { code, state, error: oauthError } = req.query as Record<string, string>;

      if (oauthError) {
        return res.redirect(`${frontendUrl}/settings?connector=${manifest.id}&oauth=error&reason=${encodeURIComponent(oauthError)}`);
      }

      if (!code || !state) {
        return res.redirect(`${frontendUrl}/settings?connector=${manifest.id}&oauth=error&reason=missing_code_or_state`);
      }

      try {
        const nonceEntry = validateAndConsumeNonce(state);
        if (!nonceEntry) {
          return res.redirect(`${frontendUrl}/settings?connector=${manifest.id}&oauth=error&reason=invalid_or_expired_state`);
        }

        const { connectorId, instanceId } = nonceEntry;
        const settings = await getRawSettings(prisma, manifest, instanceId);
        if (!settings?.clientId || !settings?.clientSecret) {
          return res.redirect(`${frontendUrl}/settings?connector=${connectorId}&oauth=error&reason=missing_credentials`);
        }

        const redirectUri = buildRedirectUri(req, connectorId);
        const tokens = await exchangeCodeForTokens(oauthConfig, settings.clientId, settings.clientSecret, code, redirectUri);
        await storeOAuthTokens(prisma, connectorId, tokens, instanceId);

        if (handlers.onOAuthSuccess) {
          await handlers.onOAuthSuccess(ctx, tokens, instanceId);
        }

        const instanceParam = instanceId ? `&instance=${encodeURIComponent(instanceId)}` : '';
        res.redirect(`${frontendUrl}/settings?connector=${connectorId}${instanceParam}&oauth=success`);
      } catch (error: any) {
        console.error(`OAuth callback error for ${manifest.name}:`, error);
        res.redirect(`${frontendUrl}/settings?connector=${manifest.id}&oauth=error&reason=${encodeURIComponent(error.message)}`);
      }
    });

    // GET /auth/status — returns OAuth connection status (no token values)
    router.get('/auth/status', async (req, res) => {
      try {
        const instanceId = manifest.multiInstance
          ? (req.query.instanceId as string | undefined)
          : undefined;
        const status = await getOAuthStatus(prisma, manifest.id, instanceId);
        res.json(status);
      } catch (error: any) {
        console.error(`OAuth status error for ${manifest.name}:`, error);
        res.status(500).json({ error: `Failed to get OAuth status: ${error.message}` });
      }
    });

    // DELETE /auth/disconnect — clears stored OAuth tokens
    router.delete('/auth/disconnect', async (req, res) => {
      try {
        const instanceId = manifest.multiInstance
          ? (req.query.instanceId as string | undefined)
          : undefined;
        await clearOAuthTokens(prisma, manifest.id, instanceId);
        res.json({ disconnected: true });
      } catch (error: any) {
        console.error(`OAuth disconnect error for ${manifest.name}:`, error);
        res.status(500).json({ error: `Failed to disconnect: ${error.message}` });
      }
    });
  }

  // ── AI Field Generation ──
  if (caps.has('ai-fields') && handlers.generateField) {
    router.post('/generate-field', async (req, res) => {
      try {
        const { taskId, fieldName, workItemType, aiInstructions, title } = req.body;
        if (!taskId || !fieldName || !aiInstructions) {
          return res.status(400).json({ error: 'taskId, fieldName, and aiInstructions are required' });
        }
        const result = await handlers.generateField!(ctx, {
          taskId,
          fieldName,
          workItemType: workItemType || manifest.name,
          aiInstructions,
          title,
        });
        res.json(result);
      } catch (error: any) {
        console.error(`Error generating field for ${manifest.name}:`, error);
        res.status(500).json({ error: `Failed to generate field: ${error.message}` });
      }
    });
  }

  // ── Custom Routes (escape hatch) ──
  if (handlers.registerCustomRoutes) {
    handlers.registerCustomRoutes(router, ctx);
  }

  return router;
}
