import { Router } from 'express';
import { getUpdateStatus, checkForUpdates, applyUpdate } from '../lib/updateChecker.js';
import { prisma } from '../lib/prisma.js';

export const updateRoutes = Router();

/**
 * @openapi
 * /api/updates/status:
 *   get:
 *     tags: [Updates]
 *     summary: Get the current update status
 *     responses:
 *       200:
 *         description: Update status including current/latest version and auto-update preference
 */
updateRoutes.get('/status', async (_req, res) => {
  try {
    const status = getUpdateStatus();
    // Isolated try/catch — a schema mismatch on AppSettings must not prevent
    // the update status (in-memory) from being returned to the client.
    let autoUpdateEnabled = true;
    try {
      const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
      autoUpdateEnabled = settings?.autoUpdateEnabled ?? true;
    } catch {
      // AppSettings unavailable — default to enabled
    }
    res.json({ ...status, autoUpdateEnabled });
  } catch (error) {
    console.error('Error fetching update status:', error);
    res.status(500).json({ error: 'Failed to fetch update status' });
  }
});

updateRoutes.post('/apply', async (_req, res) => {
  try {
    await applyUpdate();
    // Respond before the process is replaced by the installer
    res.json({ status: 'applying', message: 'Update is being applied. TaskMesh will restart shortly.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to apply update';
    res.status(400).json({ error: message });
  }
});

updateRoutes.post('/check', async (_req, res) => {
  try {
    await checkForUpdates();
    const status = getUpdateStatus();
    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    const autoUpdateEnabled = settings?.autoUpdateEnabled ?? true;
    res.json({ ...status, autoUpdateEnabled });
  } catch (error) {
    console.error('Error running manual update check:', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});
