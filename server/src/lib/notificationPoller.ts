import fs from 'fs';
import { prisma } from './prisma.js';

interface BroadcastNotification {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  targetOS: string[];
  targetTiers: string[];
  activeFrom: string;
  activeTo: string | null;
}

interface BroadcastFeed {
  notifications: BroadcastNotification[];
}

let pollerInterval: ReturnType<typeof setInterval> | null = null;

function detectOS(): string {
  if (process.env.NODE_OS) return process.env.NODE_OS;
  if (fs.existsSync('/.dockerenv')) return 'docker';
  return process.platform === 'win32' ? 'windows' : 'linux';
}

export async function pollBroadcastNotifications(): Promise<void> {
  const os = detectOS();
  const tier = process.env.LICENSE_TIER || 'free';
  const feedUrl = process.env.NOTIFICATION_FEED_URL || 'https://api.taskmesh.co/v1/notifications';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let feed: BroadcastFeed;
  try {
    const response = await fetch(feedUrl, { signal: controller.signal });
    feed = await response.json() as BroadcastFeed;
  } catch {
    return;
  } finally {
    clearTimeout(timeout);
  }

  if (!Array.isArray(feed?.notifications)) return;

  const now = new Date();

  for (const n of feed.notifications) {
    try {
      // Targeting check
      if (n.targetOS.length > 0 && !n.targetOS.includes(os)) continue;
      if (n.targetTiers.length > 0 && !n.targetTiers.includes(tier)) continue;

      // Schedule check
      if (now < new Date(n.activeFrom)) continue;
      if (n.activeTo && now > new Date(n.activeTo)) continue;

      // Skip if already dismissed
      const existing = await prisma.notification.findUnique({
        where: { broadcastId: n.id },
      });
      if (existing?.dismissed) continue;

      await prisma.notification.upsert({
        where: { broadcastId: n.id },
        update: {
          title: n.title,
          message: n.message,
          severity: n.severity,
        },
        create: {
          source: 'broadcast',
          broadcastId: n.id,
          title: n.title,
          message: n.message,
          severity: n.severity,
        },
      });
    } catch {
      // Silent — never throws
    }
  }
}

export function startNotificationPoller(): void {
  stopNotificationPoller();

  const interval = Number(process.env.NOTIFICATION_POLL_INTERVAL || 3600) * 1000;

  pollBroadcastNotifications().catch(() => undefined);

  pollerInterval = setInterval(() => {
    pollBroadcastNotifications().catch(() => undefined);
  }, interval);

  console.log(`[NotificationPoller] Started (polls every ${interval / 1000}s)`);
}

export function stopNotificationPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}
