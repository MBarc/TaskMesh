import { Express } from 'express';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { PrismaClient } from '@prisma/client';
import { ConnectorManifest, ConnectorHandlers } from './framework/types.js';
import { buildConnectorRouter } from './framework/routerFactory.js';

export const connectorsDir = path.resolve(__dirname);

// Module-level state for dynamic registration
let _app: Express | null = null;
let _prisma: PrismaClient | null = null;
const _manifests: ConnectorManifest[] = [];

// CJS require with cache-busting support
const _require = createRequire(__filename);

/**
 * Resolve the ConnectorHandlers from a loaded module, handling multiple export patterns:
 *   1. export default handlers        → { __esModule: true, default: handlers }
 *   2. export const handlers = ...   → { __esModule: true, handlers: handlers }
 *   3. module.exports = handlers     → handlers directly
 */
function resolveHandlers(mod: Record<string, unknown>): ConnectorHandlers {
  // Pattern 1 & legacy double-nested: { __esModule: true, default: ... }
  if (mod.__esModule && mod.default) {
    const inner = mod.default as Record<string, unknown>;
    if (inner && typeof inner === 'object' && inner.__esModule && inner.default) {
      return inner.default as ConnectorHandlers;
    }
    return inner as ConnectorHandlers;
  }
  // Pattern 2: { __esModule: true, handlers: { testConnection, ... } }
  if (mod.__esModule && mod.handlers && typeof mod.handlers === 'object') {
    return mod.handlers as ConnectorHandlers;
  }
  // Pattern 3: module.exports = handlers directly
  return mod as unknown as ConnectorHandlers;
}

/**
 * Discover all connectors in the connectors/ directory and register their routes.
 * Each connector must have a manifest.json and a handlers.ts (compiled to handlers.js).
 */
export async function registerAllConnectors(
  app: Express,
  prisma: PrismaClient,
): Promise<ConnectorManifest[]> {
  _app = app;
  _prisma = prisma;

  const entries = fs.readdirSync(connectorsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'framework') continue;

    const manifestPath = path.join(connectorsDir, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest: ConnectorManifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8'),
      );

      // Import the handler module (ESM dynamic import with CJS interop)
      const handlersModule = await import(`./${entry.name}/handlers.js`);
      const handlers = resolveHandlers(handlersModule as Record<string, unknown>);

      const router = buildConnectorRouter(manifest, handlers, prisma);
      app.use(`/api/${manifest.id}`, router);

      _manifests.push(manifest);
      console.log(`  Registered connector: ${manifest.name} (${manifest.id}) v${manifest.version}`);
    } catch (error) {
      console.error(`  Failed to register connector from ${entry.name}:`, error);
    }
  }

  // Expose manifest listing for the client
  app.get('/api/connectors', (_req, res) => {
    res.json(_manifests);
  });

  return _manifests;
}

/**
 * Dynamically register a single connector at runtime without restarting the server.
 * The connector directory must already contain manifest.json and compiled handlers.js.
 */
export async function registerConnector(connectorDir: string): Promise<ConnectorManifest> {
  if (!_app || !_prisma) {
    throw new Error('Registry not initialized. Call registerAllConnectors first.');
  }

  const manifestPath = path.join(connectorDir, 'manifest.json');
  const manifest: ConnectorManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const handlersJsPath = path.join(connectorDir, 'handlers.js');

  // Clear CJS require cache so re-imports always get fresh code
  const resolved = _require.resolve(handlersJsPath);
  delete (_require.cache as Record<string, unknown>)[resolved];

  const handlersModule = _require(handlersJsPath) as Record<string, unknown>;
  const handlers = resolveHandlers(handlersModule);

  const router = buildConnectorRouter(manifest, handlers, _prisma);
  _app.use(`/api/${manifest.id}`, router);

  // Update or add to the live manifests list
  const existingIdx = _manifests.findIndex(m => m.id === manifest.id);
  if (existingIdx >= 0) {
    _manifests[existingIdx] = manifest;
  } else {
    _manifests.push(manifest);
  }

  console.log(`  Dynamically registered connector: ${manifest.name} (${manifest.id}) v${manifest.version}`);
  return manifest;
}
