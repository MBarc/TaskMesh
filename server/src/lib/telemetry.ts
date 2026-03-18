import { PostHog } from 'posthog-node';
import { randomUUID } from 'crypto';
import { prisma } from './prisma.js';

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;
  if (!_client) {
    _client = new PostHog(key, {
      host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _client;
}

export async function capture(event: string, properties?: Record<string, unknown>): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;

    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    if (!settings?.telemetryEnabled) return;

    let installUUID = settings.installUUID;
    if (!installUUID) {
      installUUID = randomUUID();
      await prisma.appSettings.update({ where: { id: 'singleton' }, data: { installUUID } });
    }

    client.capture({ distinctId: installUUID, event, properties: properties ?? {} });
  } catch {
    // fire-and-forget — never surface telemetry errors to the caller
  }
}

export async function shutdown(): Promise<void> {
  if (_client) {
    await _client.shutdown();
  }
}
