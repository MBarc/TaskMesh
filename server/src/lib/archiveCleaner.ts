import { prisma } from './prisma.js';

let cleanerInterval: ReturnType<typeof setInterval> | null = null;

const ONE_HOUR = 60 * 60 * 1000;

export function startArchiveCleaner(): void {
  stopArchiveCleaner();

  // Run once on startup
  runCleanup().catch((err) =>
    console.error('[ArchiveCleaner] Initial cleanup error:', err)
  );

  // Then every hour
  cleanerInterval = setInterval(() => {
    runCleanup().catch((err) =>
      console.error('[ArchiveCleaner] Cleanup error:', err)
    );
  }, ONE_HOUR);

  console.log('[ArchiveCleaner] Started (runs every hour)');
}

export function stopArchiveCleaner(): void {
  if (cleanerInterval) {
    clearInterval(cleanerInterval);
    cleanerInterval = null;
  }
}

export async function runCleanup(): Promise<number> {
  const settings = await prisma.appSettings.findUnique({
    where: { id: 'singleton' },
  });

  if (!settings?.archiveEnabled) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - settings.archiveRetentionDays);

  const result = await prisma.archivedTask.deleteMany({
    where: { archivedAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    console.log(`[ArchiveCleaner] Purged ${result.count} expired archived task(s)`);
  }

  return result.count;
}
