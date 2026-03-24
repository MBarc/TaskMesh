import os from 'os';
import { prisma } from './prisma.js';
import { getOrCreateMachineId } from '../routes/license.js';

const VALIDATION_URL = process.env.LICENSE_VALIDATION_URL ?? 'https://taskmesh.co/api/license/validate';
const POLL_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function validateLicense(): Promise<void> {
  const settings = await prisma.appSettings.findUnique({
    where: { id: 'singleton' },
    select: {
      licenseKey: true,
      machineId: true,
      lastValidatedAt: true,
    },
  });

  // No license stored — nothing to do
  if (!settings?.licenseKey) return;

  const machineId = settings.machineId ?? await getOrCreateMachineId();
  const machineName = os.hostname();

  type ValidationResult = { valid: boolean; tier?: string; expiresAt?: string | null; error?: string };
  let result: ValidationResult | null = null;

  try {
    const response = await fetch(VALIDATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settings.licenseKey, machineId, machineName }),
    });
    result = await response.json() as ValidationResult;
  } catch {
    // Server unreachable — apply grace period logic
    const lastValidated = settings.lastValidatedAt;
    if (lastValidated && Date.now() - lastValidated.getTime() < GRACE_PERIOD_MS) {
      console.log('[License] Validation server unreachable — within grace period, keeping license active.');
    } else {
      console.warn('[License] Validation server unreachable and grace period expired — deactivating license.');
      await clearLicense();
    }
    return;
  }

  if (!result?.valid) {
    console.warn(`[License] License invalidated by server: ${result?.error ?? 'unknown reason'} — deactivating.`);
    await clearLicense();
    return;
  }

  // Valid — update lastValidatedAt and refresh expiry
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: {
      lastValidatedAt: new Date(),
      licenseTier: result.tier ?? null,
      licenseExpiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
    },
  });

  console.log('[License] Periodic validation successful.');
}

async function clearLicense(): Promise<void> {
  await prisma.appSettings.update({
    where: { id: 'singleton' },
    data: {
      licenseKey: null,
      licenseTier: null,
      licenseExpiresAt: null,
      licenseActivatedAt: null,
      lastValidatedAt: null,
    },
  });
}

export function startLicensePoller(): void {
  // Validate immediately on startup
  validateLicense().catch(err => console.error('[License] Startup validation error:', err));

  // Then poll every 12 hours
  pollTimer = setInterval(() => {
    validateLicense().catch(err => console.error('[License] Periodic validation error:', err));
  }, POLL_INTERVAL_MS);
}

export function stopLicensePoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
