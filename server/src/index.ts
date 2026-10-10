import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
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
import { localGuard } from './lib/localGuard.js';
import { swaggerSpec } from './lib/swagger.js';
import { startEmailPoller, stopEmailPoller } from './lib/emailPoller.js';
import { startArchiveCleaner, stopArchiveCleaner } from './lib/archiveCleaner.js';
import { startNotificationPoller, stopNotificationPoller } from './lib/notificationPoller.js';
import { startUpdateChecker, stopUpdateChecker } from './lib/updateChecker.js';
import { startLicensePoller, stopLicensePoller } from './lib/licensePoller.js';
import { registerAllConnectors } from './connectors/registry.js';
import { connectorImportRouter } from './routes/connectorImport.js';
import { settingsRoutes } from './routes/settings.js';
import { licenseRoutes } from './routes/license.js';
import { updateRoutes } from './routes/updates.js';
import { telemetryRoutes } from './routes/telemetry.js';
import { themeRoutes } from './routes/themes.js';
import { sortRoutes } from './routes/sorts.js';
import { capture, shutdown } from './lib/telemetry.js';
import { prisma, encryptLegacyConnectorConfigs } from './lib/prisma.js';
import { backupSqlite } from './lib/dbBackup.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
// Loopback only by default. Docker sets HOST=0.0.0.0 so the container port can be published.
const HOST = process.env.HOST || '127.0.0.1';

// Middleware
app.use(localGuard);
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

// ── Schema migration (SQLite / installer deployments only) ───────────────────
// Runs `prisma db push` at startup to add tables/columns introduced since the
// database was created. The SQLite file is backed up first (newest 3 kept), and
// there is deliberately no --accept-data-loss: Prisma applies additive changes and
// refuses anything that would drop data, which we surface as a notification.
// Skipped in Docker (PostgreSQL) deployments, where `npm start` syncs the schema.
// ponytail: db push, not versioned migrations; adopt `prisma migrate` before the
// first release that needs to rename or reshape existing columns.
async function runSchemaMigration(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.startsWith('file:')) return; // PostgreSQL / Docker — skip

  const serverDir = path.join(__dirname, '..');
  const prismaScript = path.join(serverDir, 'node_modules', 'prisma', 'build', 'index.js');
  if (!fs.existsSync(prismaScript)) {
    console.warn('[migration] Prisma CLI not found — skipping schema sync.');
    return;
  }

  // SQLite paths in DATABASE_URL are relative to the prisma/ directory
  const dbFile = path.resolve(serverDir, 'prisma', dbUrl.slice('file:'.length));
  try {
    const backup = backupSqlite(dbFile);
    if (backup) console.log(`[migration] Backed up database to ${backup}`);
  } catch (err) {
    console.error('[migration] Database backup failed — skipping schema sync to be safe:', (err as Error).message);
    return;
  }

  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn(process.execPath, [prismaScript, 'db', 'push', '--skip-generate'], {
      env: process.env,
      cwd: serverDir,
      stdio: 'pipe',
    });

    let out = '';
    child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { out += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[migration] Database schema is current.');
      } else {
        console.error(`[migration] Schema sync refused or failed (code ${code}); no data was dropped: ${out.trim()}`);
      }
      resolve(code === 0);
    });

    child.on('error', (err) => {
      console.error('[migration] Schema migration spawn error:', (err as Error).message);
      resolve(false);
    });
  });

  if (!ok) {
    await prisma.notification.create({
      data: {
        source: 'schema-migration',
        title: 'Database update needs attention',
        message: `This version's database changes could not be applied automatically, so your data was left untouched. A backup is next to ${path.basename(dbFile)}. Please contact support before continuing.`,
        severity: 'error',
      },
    }).catch(() => { /* table may not exist on a broken schema; the log above still has it */ });
  }
}

async function start() {
  // Ensure the SQLite schema is current before any Prisma operations.
  // Adds missing columns to existing databases from older installer versions.
  await runSchemaMigration();

  // Encrypt connector credentials saved by versions that stored them in plaintext
  try {
    const n = await encryptLegacyConnectorConfigs();
    if (n) console.log(`[crypto] Encrypted ${n} connector config(s) stored by an older version.`);
  } catch (err) {
    console.error('[crypto] Could not encrypt stored connector configs:', (err as Error).message);
  }

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

  app.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
    startEmailPoller();
    startArchiveCleaner();
    startNotificationPoller();
    startUpdateChecker();
    startLicensePoller();
    capture('app_started', { version: process.env.npm_package_version ?? 'unknown' });
  });

  process.on('SIGTERM', async () => {
    stopEmailPoller();
    stopArchiveCleaner();
    stopNotificationPoller();
    stopUpdateChecker();
    stopLicensePoller();
    await shutdown();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
