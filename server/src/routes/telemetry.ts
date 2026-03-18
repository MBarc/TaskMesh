import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { capture } from '../lib/telemetry.js';

export const telemetryRoutes = Router();

telemetryRoutes.post('/app-loaded', async (req, res) => {
  try {
    const { theme } = req.body as { theme?: string };

    const board_count = await prisma.board.count();

    capture('app_loaded', {
      board_count,
      theme: theme ?? 'unknown',
      version: process.env.npm_package_version ?? 'unknown',
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error capturing app_loaded:', error);
    res.status(500).json({ error: 'Failed to capture event' });
  }
});

const ALLOWED_CLIENT_EVENTS = new Set(['theme_changed', 'tab_switched']);

telemetryRoutes.post('/event', async (req, res) => {
  try {
    const { event, properties } = req.body as { event?: string; properties?: Record<string, unknown> };

    if (!event || !ALLOWED_CLIENT_EVENTS.has(event)) {
      return res.status(400).json({ error: 'Invalid event' });
    }

    capture(event, properties ?? {});
    res.status(204).send();
  } catch (error) {
    console.error('Error capturing event:', error);
    res.status(500).json({ error: 'Failed to capture event' });
  }
});
