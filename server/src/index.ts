import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { boardRoutes } from './routes/boards.js';
import { columnRoutes } from './routes/columns.js';
import { taskRoutes } from './routes/tasks.js';
import { aiRoutes } from './routes/ai.js';
import { apiKeyRoutes } from './routes/apikeys.js';
import { archiveRoutes } from './routes/archive.js';
import { apiKeyAuth } from './lib/apiKeyAuth.js';
import { swaggerSpec } from './lib/swagger.js';
import { startEmailPoller } from './lib/emailPoller.js';
import { startArchiveCleaner } from './lib/archiveCleaner.js';
import { registerAllConnectors } from './connectors/registry.js';
import { connectorImportRouter } from './routes/connectorImport.js';
import { prisma } from './lib/prisma.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
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
app.use('/api/connectors/import', connectorImportRouter);

async function start() {
  // Connector SDK — auto-discover and register connectors
  const manifests = await registerAllConnectors(app, prisma);
  console.log(`Connector SDK: ${manifests.length} connector(s) registered`);

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
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
