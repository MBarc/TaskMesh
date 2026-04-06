import { Router } from 'express';
import { getUpdateStatus, checkForUpdates, applyUpdate, delayUpdate, acknowledgeWarning, enableAutoUpdate, rescheduleFromDB } from '../lib/updateChecker.js';
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
 *         description: Update status including current/latest version, schedule, and warning state
 */
updateRoutes.get('/status', async (_req, res) => {
  try {
    const status = getUpdateStatus();
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

/**
 * @openapi
 * /api/updates/acknowledge:
 *   post:
 *     tags: [Updates]
 *     summary: Acknowledge the pre-update warning modal
 */
updateRoutes.post('/acknowledge', (_req, res) => {
  try {
    acknowledgeWarning();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to acknowledge warning' });
  }
});

/**
 * @openapi
 * /api/updates/delay:
 *   post:
 *     tags: [Updates]
 *     summary: Delay the scheduled update by 1 hour (one-time only)
 */
updateRoutes.post('/delay', async (_req, res) => {
  try {
    await delayUpdate();
    const status = getUpdateStatus();
    res.json({ ok: true, scheduledApplyAt: status.scheduledApplyAt });
  } catch (error) {
    console.error('Error delaying update:', error);
    res.status(500).json({ error: 'Failed to delay update' });
  }
});

/**
 * @openapi
 * /api/updates/schedule:
 *   patch:
 *     tags: [Updates]
 *     summary: Change the auto-update schedule day and hour
 */
updateRoutes.patch('/schedule', async (req, res) => {
  try {
    const { day, hour } = req.body as Record<string, unknown>;

    if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) {
      return res.status(400).json({ error: 'day must be an integer 0–6 (0 = Sunday)' });
    }
    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
      return res.status(400).json({ error: 'hour must be an integer 0–23' });
    }

    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', updateScheduleDay: day, updateScheduleHour: hour },
      update: { updateScheduleDay: day, updateScheduleHour: hour },
    });

    // Re-register the OS scheduled task with the new schedule if auto-update is on
    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    if (settings?.autoUpdateEnabled) {
      try {
        await enableAutoUpdate(day, hour);
      } catch (err) {
        console.error('[schedule] OS task re-registration failed:', err);
      }
    }

    // Reschedule in-memory timers
    await rescheduleFromDB();

    const status = getUpdateStatus();
    res.json({ ok: true, scheduleDay: day, scheduleHour: hour, scheduledApplyAt: status.scheduledApplyAt });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});
