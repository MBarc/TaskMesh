import { PrismaClient } from '@prisma/client';
import { ConnectorManifest, ManifestSettingsField } from './types.js';

/**
 * Derive the ConnectorConfig row ID from connector + optional instance.
 * Singletons use the connectorId directly; multi-instance uses "connectorId_instanceId".
 */
function configRowId(connectorId: string, instanceId?: string): string {
  return instanceId ? `${connectorId}_${instanceId}` : connectorId;
}

/**
 * Mask a secret value: show only the last 4 characters.
 */
function maskSecret(value: string): string {
  return value && value.length > 4 ? '****' + value.slice(-4) : '****';
}

/**
 * Apply normalizations declared in the manifest field spec.
 */
function normalizeValue(value: any, field: ManifestSettingsField): any {
  if (typeof value !== 'string') return value;
  if (field.normalize === 'stripTrailingSlash') {
    return value.replace(/\/+$/, '');
  }
  return value;
}

// ──────────────────────────────────────────────
// GET settings
// ──────────────────────────────────────────────

export async function getSettings(
  prisma: PrismaClient,
  manifest: ConnectorManifest,
  instanceId?: string,
): Promise<Record<string, any> | null> {
  const id = configRowId(manifest.id, instanceId);

  const row = await (prisma as any).connectorConfig.findUnique({ where: { id } });
  if (!row) return null;

  const config: Record<string, any> = row.config as Record<string, any> ?? {};
  const result: Record<string, any> = {};

  // Copy all non-secret fields directly
  for (const field of manifest.settings.fields) {
    if (field.secret) {
      const raw = config[field.key];
      if (raw) {
        result[`${field.key}Configured`] = true;
        result[`${field.key}Masked`] = maskSecret(raw);
      } else {
        result[`${field.key}Configured`] = false;
        result[`${field.key}Masked`] = '';
      }
    } else {
      result[field.key] = config[field.key] ?? field.default ?? '';
    }
  }

  // Copy custom JSON fields
  for (const cf of manifest.settings.customFields) {
    result[cf.key] = config[cf.key] ?? {};
  }

  // Include instance metadata for multi-instance connectors
  if (manifest.multiInstance && instanceId) {
    result.id = instanceId;
    result[manifest.instanceKey || 'instanceId'] = instanceId;
  }

  return result;
}

// ──────────────────────────────────────────────
// PUT settings (save / upsert)
// ──────────────────────────────────────────────

export async function saveSettings(
  prisma: PrismaClient,
  manifest: ConnectorManifest,
  data: Record<string, any>,
  instanceId?: string,
): Promise<Record<string, any>> {
  const id = configRowId(manifest.id, instanceId);

  // Validate required non-secret fields
  for (const field of manifest.settings.fields) {
    if (field.required && !field.secret && !data[field.key]) {
      throw new SettingsValidationError(`${field.label} is required`);
    }
  }

  // Load existing config to preserve unchanged secrets
  const existing = await (prisma as any).connectorConfig.findUnique({ where: { id } });
  const existingConfig: Record<string, any> = (existing?.config as Record<string, any>) ?? {};

  // Build the new config object
  const config: Record<string, any> = {};

  for (const field of manifest.settings.fields) {
    let value = data[field.key];

    if (field.secret) {
      // If the incoming value looks like a mask or is empty, keep the existing secret
      if (!value || (typeof value === 'string' && value.startsWith('****'))) {
        // On first save, a secret is required
        if (field.required && !existingConfig[field.key]) {
          throw new SettingsValidationError(`${field.label} is required`);
        }
        value = existingConfig[field.key] ?? '';
      }
    }

    // Apply normalizations
    value = normalizeValue(value, field);

    // Type coercions
    if (field.type === 'number' && value !== '' && value !== undefined && value !== null) {
      value = Number(value);
    }
    if (field.type === 'checkbox') {
      value = !!value;
    }

    config[field.key] = value;
  }

  // Copy custom JSON fields
  for (const cf of manifest.settings.customFields) {
    config[cf.key] = data[cf.key] ?? existingConfig[cf.key] ?? {};
  }

  // Multi-instance exclusive active: deactivate other instances
  if (manifest.multiInstance && manifest.exclusiveActive && config.active) {
    const otherInstances = (manifest.instances || []).filter(i => i !== instanceId);
    for (const otherId of otherInstances) {
      const otherRowId = configRowId(manifest.id, otherId);
      const otherRow = await (prisma as any).connectorConfig.findUnique({ where: { id: otherRowId } });
      if (otherRow) {
        const otherConfig = (otherRow.config as Record<string, any>) ?? {};
        if (otherConfig.active) {
          otherConfig.active = false;
          await (prisma as any).connectorConfig.update({
            where: { id: otherRowId },
            data: { config: otherConfig },
          });
        }
      }
    }
  }

  // Upsert the config row
  const row = await (prisma as any).connectorConfig.upsert({
    where: { id },
    update: {
      config,
    },
    create: {
      id,
      connectorId: manifest.id,
      instanceId: instanceId || null,
      config,
      enabled: true,
    },
  });

  // Build masked response (same as GET)
  return getSettings(prisma, manifest, instanceId) as Promise<Record<string, any>>;
}

// ──────────────────────────────────────────────
// Load raw settings (secrets unmasked) for handler use
// ──────────────────────────────────────────────

export async function getRawSettings(
  prisma: PrismaClient,
  manifest: ConnectorManifest,
  instanceId?: string,
): Promise<Record<string, any> | null> {
  const id = configRowId(manifest.id, instanceId);
  const row = await (prisma as any).connectorConfig.findUnique({ where: { id } });
  if (!row) return null;
  return (row.config as Record<string, any>) ?? {};
}

// ──────────────────────────────────────────────
// Custom error for validation
// ──────────────────────────────────────────────

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}
