import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { capture } from '../lib/telemetry.js';
import { enableAutoUpdate, disableAutoUpdate, rescheduleFromDB } from '../lib/updateChecker.js';

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
    const { telemetryEnabled, archiveEnabled, archiveRetentionDays, autoUpdateEnabled, updateScheduleDay, updateScheduleHour } = req.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof telemetryEnabled === 'boolean') data.telemetryEnabled = telemetryEnabled;
    if (typeof archiveEnabled === 'boolean') data.archiveEnabled = archiveEnabled;
    if (typeof archiveRetentionDays === 'number') data.archiveRetentionDays = archiveRetentionDays;
    if (typeof autoUpdateEnabled === 'boolean') data.autoUpdateEnabled = autoUpdateEnabled;
    if (typeof updateScheduleDay === 'number' && updateScheduleDay >= 0 && updateScheduleDay <= 6) data.updateScheduleDay = updateScheduleDay;
    if (typeof updateScheduleHour === 'number' && updateScheduleHour >= 0 && updateScheduleHour <= 23) data.updateScheduleHour = updateScheduleHour;
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

    // Sync the scheduled task / cron entry with the new auto-update preference.
    if (typeof autoUpdateEnabled === 'boolean') {
      try {
        if (autoUpdateEnabled) {
          await enableAutoUpdate(settings.updateScheduleDay, settings.updateScheduleHour);
        } else {
          await disableAutoUpdate();
        }
      } catch (err) {
        console.error('[autoUpdate] toggle failed (DB already updated):', err);
      }
    }

    // If schedule changed but auto-update is still on, re-register the OS task and timers.
    if ((typeof updateScheduleDay === 'number' || typeof updateScheduleHour === 'number') && typeof autoUpdateEnabled === 'undefined') {
      if (settings.autoUpdateEnabled) {
        try {
          await enableAutoUpdate(settings.updateScheduleDay, settings.updateScheduleHour);
        } catch (err) {
          console.error('[autoUpdate] schedule re-registration failed:', err);
        }
      }
      await rescheduleFromDB();
    }

    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});
