import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { capture } from '../lib/telemetry.js';

export const notificationRoutes = Router();

// GET /api/notifications
notificationRoutes.get('/', async (_req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { dismissed: false },
      orderBy: { createdAt: 'desc' },
    });
    res.json(notifications);
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// POST /api/notifications
notificationRoutes.post('/', async (req, res) => {
  try {
    const { title, message, severity = 'info', source = 'local' } = req.body as {
      title: string;
      message: string;
      severity?: string;
      source?: string;
    };

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required' });
    }

    const notification = await prisma.notification.create({
      data: { source, title, message, severity },
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// PUT /api/notifications/read-all
notificationRoutes.put('/read-all', async (_req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { dismissed: false },
      data: { read: true },
    });
    capture('notifications_read_all');
    res.status(204).send();
  } catch (error) {
    console.error('Error marking notifications read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// DELETE /api/notifications/:id
notificationRoutes.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    await prisma.notification.update({
      where: { id },
      data: { dismissed: true },
    });
    capture('notification_dismissed');
    res.status(204).send();
  } catch (error) {
    console.error('Error dismissing notification:', error);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

// DELETE /api/notifications
notificationRoutes.delete('/', async (_req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { dismissed: false },
      data: { dismissed: true },
    });
    capture('notifications_dismissed_all');
    res.status(204).send();
  } catch (error) {
    console.error('Error dismissing all notifications:', error);
    res.status(500).json({ error: 'Failed to dismiss all notifications' });
  }
});
