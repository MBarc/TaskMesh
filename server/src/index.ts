import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { boardRoutes } from './routes/boards.js';
import { columnRoutes } from './routes/columns.js';
import { taskRoutes } from './routes/tasks.js';
import { aiRoutes } from './routes/ai.js';
import { apiKeyRoutes } from './routes/apikeys.js';
import { archiveRoutes } from './routes/archive.js';
import { exportRoutes } from './routes/export.js';
import { importRoutes } from './routes/import.js';
import { notificationRoutes } from './routes/notifications.js';
import { searchRoutes } from './routes/search.js';
import documentationRouter from './routes/documentation.js';
import { apiKeyAuth } from './lib/apiKeyAuth.js';
import { swaggerSpec } from './lib/swagger.js';
import { startEmailPoller, stopEmailPoller } from './lib/emailPoller.js';
import { startArchiveCleaner, stopArchiveCleaner } from './lib/archiveCleaner.js';
import { startNotificationPoller, stopNotificationPoller } from './lib/notificationPoller.js';
import { startUpdateChecker, stopUpdateChecker } from './lib/updateChecker.js';
import { registerAllConnectors } from './connectors/registry.js';
import { connectorImportRouter } from './routes/connectorImport.js';
import { settingsRoutes } from './routes/settings.js';
import { licenseRoutes } from './routes/license.js';
import { updateRoutes } from './routes/updates.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { themeRoutes } from './routes/themes.js';
import { sortRoutes } from './routes/sorts.js';
import { capture, shutdown } from './lib/telemetry.js';
import { prisma } from './lib/prisma.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
app.use(cors());
app.use(express.json());
app.use(apiKeyAuth);

// Swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// Routes
app.use('/api/boards', boardRoutes);
app.use('/api/columns', columnRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/import', importRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/connectors/import', connectorImportRouter);
app.use('/api/documentation', documentationRouter);
app.use('/api/settings', settingsRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/updates', updateRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/themes', themeRoutes);
app.use('/api/sorts', sortRoutes);

// On a fresh install the telemetry preference chosen during setup is written to
// TASKMESH_TELEMETRY_ENABLED by install-services.ps1.  We honour it exactly once:
// if no AppSettings row exists yet (first ever boot), we create it with the
// installer's choice.  On every subsequent boot the row already exists, so user
// changes made via Settings → Privacy are never overwritten.
async function initializeTelemetryFromInstaller(): Promise<void> {
  try {
    const envPref = process.env.TASKMESH_TELEMETRY_ENABLED;
    if (envPref !== '1') return; // off by default — only act when explicitly opted in

    const existing = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    if (existing) return; // already initialized — respect whatever the user set

    await prisma.appSettings.create({
      data: { id: 'singleton', telemetryEnabled: true },
    });
    console.log('Telemetry enabled via installer preference.');
  } catch {
    // Non-critical — silently ignore
  }
}

async function start() {
  // Connector SDK — auto-discover and register connectors
  const manifests = await registerAllConnectors(app, prisma);
  console.log(`Connector SDK: ${manifests.length} connector(s) registered`);

  await initializeTelemetryFromInstaller();

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Serve React SPA when the client build is present (Windows installer deployment).
  // Client files are installed at {app}/server/public/ — one level up from __dirname
  // ({app}/server/dist/), so the path is ../public with no ambiguity.
  // In Docker the server container has no public/ folder so existsSync returns false
  // and the block is skipped automatically.
  const clientDist = path.join(__dirname, '../public');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startEmailPoller();
    startArchiveCleaner();
    startNotificationPoller();
    startUpdateChecker();
    capture('app_started', { version: process.env.npm_package_version ?? 'unknown' });
  });

  process.on('SIGTERM', async () => {
    stopEmailPoller();
    stopArchiveCleaner();
    stopNotificationPoller();
    stopUpdateChecker();
    await shutdown();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
