import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const licenseRoutes = Router();

const SINGLETON_ID = 'singleton';
const VALIDATION_URL = process.env.LICENSE_VALIDATION_URL ?? 'https://taskmesh.co/api/license/validate';

/**
 * @openapi
 * /api/license:
 *   get:
 *     tags: [License]
 *     summary: Get current license info
 *     responses:
 *       200:
 *         description: Current license status
 */
licenseRoutes.get('/', async (_req, res) => {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { licenseKey: true, licenseTier: true, licenseExpiresAt: true, licenseActivatedAt: true },
    });

    res.json({
      licenseKey: settings?.licenseKey ?? null,
      licenseTier: settings?.licenseTier ?? null,
      licenseExpiresAt: settings?.licenseExpiresAt ?? null,
      licenseActivatedAt: settings?.licenseActivatedAt ?? null,
    });
  } catch (error) {
    console.error('Error fetching license:', error);
    res.status(500).json({ error: 'Failed to fetch license' });
  }
});

/**
 * @openapi
 * /api/license:
 *   post:
 *     tags: [License]
 *     summary: Activate a license key
 */
licenseRoutes.post('/', async (req, res) => {
  const { key } = req.body as { key?: string };

  if (!key || typeof key !== 'string' || !key.trim()) {
    return res.status(400).json({ error: 'License key is required' });
  }

  const trimmedKey = key.trim().toUpperCase();

  // Validate against taskmesh.co
  let validationResult: { valid: boolean; tier?: string; expiresAt?: string | null; error?: string };
  try {
    const response = await fetch(VALIDATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: trimmedKey }),
    });
    validationResult = await response.json() as typeof validationResult;
  } catch {
    return res.status(502).json({ error: 'Could not reach the license server. Check your internet connection.' });
  }

  if (!validationResult.valid) {
    return res.status(400).json({ error: validationResult.error ?? 'Invalid license key' });
  }

  const settings = await prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      licenseKey: trimmedKey,
      licenseTier: validationResult.tier ?? null,
      licenseExpiresAt: validationResult.expiresAt ? new Date(validationResult.expiresAt) : null,
      licenseActivatedAt: new Date(),
    },
    update: {
      licenseKey: trimmedKey,
      licenseTier: validationResult.tier ?? null,
      licenseExpiresAt: validationResult.expiresAt ? new Date(validationResult.expiresAt) : null,
      licenseActivatedAt: new Date(),
    },
  });

  res.json({
    licenseKey: settings.licenseKey,
    licenseTier: settings.licenseTier,
    licenseExpiresAt: settings.licenseExpiresAt,
    licenseActivatedAt: settings.licenseActivatedAt,
  });
});

/**
 * @openapi
 * /api/license:
 *   delete:
 *     tags: [License]
 *     summary: Deactivate the current license
 */
licenseRoutes.delete('/', async (_req, res) => {
  try {
    await prisma.appSettings.update({
      where: { id: SINGLETON_ID },
      data: {
        licenseKey: null,
        licenseTier: null,
        licenseExpiresAt: null,
        licenseActivatedAt: null,
      },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deactivating license:', error);
    res.status(500).json({ error: 'Failed to deactivate license' });
  }
});
