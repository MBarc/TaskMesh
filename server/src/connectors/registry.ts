import { Express } from 'express';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { ConnectorManifest, ConnectorHandlers } from './framework/types.js';
import { buildConnectorRouter } from './framework/routerFactory.js';

/**
 * Discover all connectors in the connectors/ directory and register their routes.
 * Each connector must have a manifest.json and a handlers.ts (compiled to handlers.js).
 */
export async function registerAllConnectors(
  app: Express,
  prisma: PrismaClient,
): Promise<ConnectorManifest[]> {
  const connectorsDir = path.resolve(__dirname);
  const manifests: ConnectorManifest[] = [];

  // Scan for subdirectories containing manifest.json
  const entries = fs.readdirSync(connectorsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'framework') continue;

    const manifestPath = path.join(connectorsDir, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest: ConnectorManifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8'),
      );

      // Import the handler module
      // Handle CJS/ESM interop: TypeScript compiles `export default X` to CJS
      // as `exports.default = X`. When Node.js import() loads a CJS module, it
      // wraps module.exports as the ESM default, creating double-nesting:
      //   handlersModule.default = { __esModule: true, default: actualHandlers }
      const handlersModule = await import(`./${entry.name}/handlers.js`);
      const raw = handlersModule.default || handlersModule;
      const handlers: ConnectorHandlers =
        raw && typeof raw === 'object' && raw.__esModule && raw.default
          ? raw.default
          : raw;

      // Build and mount the router
      const router = buildConnectorRouter(manifest, handlers, prisma);
      app.use(`/api/${manifest.id}`, router);

      manifests.push(manifest);
      console.log(`  Registered connector: ${manifest.name} (${manifest.id}) v${manifest.version}`);
    } catch (error) {
      console.error(`  Failed to register connector from ${entry.name}:`, error);
    }
  }

  // Expose manifest listing for the client
  app.get('/api/connectors', (req, res) => {
    res.json(manifests);
  });

  return manifests;
}
