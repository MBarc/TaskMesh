import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { capture } from '../lib/telemetry.js';

export const settingsRoutes = Router();

const SINGLETON_ID = 'singleton';

const DEFAULTS = {
  archiveEnabled: false,
  archiveRetentionDays: 30,
  telemetryEnabled: false,
  activeThemeId: 'default-light',
  autoUpdateEnabled: true,
};

/**
 * @openapi
 * /api/settings:
 *   get:
 *     tags: [Settings]
 *     summary: Get application settings
 *     responses:
 *       200:
 *         description: Current settings
 */
settingsRoutes.get('/', async (_req, res) => {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: SINGLETON_ID } });
    res.json({ ...DEFAULTS, ...settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * @openapi
 * /api/settings:
 *   patch:
 *     tags: [Settings]
 *     summary: Update application settings
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               telemetryEnabled:
 *                 type: boolean
 *               archiveEnabled:
 *                 type: boolean
 *               archiveRetentionDays:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated settings
 */
settingsRoutes.patch('/', async (req, res) => {
  try {
    const { telemetryEnabled, archiveEnabled, archiveRetentionDays, autoUpdateEnabled } = req.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof telemetryEnabled === 'boolean') data.telemetryEnabled = telemetryEnabled;
    if (typeof archiveEnabled === 'boolean') data.archiveEnabled = archiveEnabled;
    if (typeof archiveRetentionDays === 'number') data.archiveRetentionDays = archiveRetentionDays;
    if (typeof autoUpdateEnabled === 'boolean') data.autoUpdateEnabled = autoUpdateEnabled;
    const { activeThemeId } = req.body as Record<string, unknown>;
    if (typeof activeThemeId === 'string' && activeThemeId.trim()) data.activeThemeId = activeThemeId.trim();

    const settings = await prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...DEFAULTS, ...data },
      update: data,
    });

    for (const [field, value] of Object.entries(data)) {
      capture('settings_updated', { field, value });
    }

    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});
