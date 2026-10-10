import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt, isEncrypted } from './crypto.js';

// The Windows/Linux installers run on SQLite, and their build scripts patch every
// `Json` column in schema.prisma to `String` (Prisma 5 has no Json type on SQLite).
// Without this, every write of an object/array to those columns fails validation.
// So on SQLite we JSON-encode these fields on write and decode them on read, and
// route code keeps working with plain objects as it does on Postgres.
// Keep in sync with the `Json` fields in prisma/schema.prisma (prisma.test.ts checks).
export const JSON_FIELDS: Record<string, string[]> = {
  AIExtraction: ['extractedTasks'],
  ApiKey: ['scopes'],
  DocumentationSettings: ['templates', 'customVariables'],
  ConnectorConfig: ['config'],
  ArchivedTask: ['snapshot'],
  CustomTheme: ['colors'],
  BoardSort: ['sorts'],
};

// Fields encrypted at rest (AES-256-GCM via lib/crypto): connector settings hold
// passwords, API tokens and OAuth access/refresh tokens. Stored as one "enc:…"
// string; rows written before encryption existed are read as-is and re-encrypted
// on their next write (and by encryptLegacyConnectorConfigs at startup).
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  ConnectorConfig: ['config'],
};

export function encodeFields(fields: string[], data: any): void {
  if (!data || typeof data !== 'object') return;
  for (const f of fields) {
    if (data[f] !== undefined && data[f] !== null) data[f] = JSON.stringify(data[f]);
  }
}

export function decodeFields(fields: string[], row: any): void {
  if (!row || typeof row !== 'object') return;
  for (const f of fields) {
    if (typeof row[f] !== 'string') continue;
    try {
      row[f] = JSON.parse(row[f]);
    } catch {
      // not JSON (legacy raw value) — leave as-is
    }
  }
}

export function encryptFields(fields: string[], data: any): void {
  if (!data || typeof data !== 'object') return;
  for (const f of fields) {
    if (data[f] !== undefined && data[f] !== null) data[f] = encrypt(JSON.stringify(data[f]));
  }
}

export function decryptFields(fields: string[], row: any): void {
  if (!row || typeof row !== 'object') return;
  for (const f of fields) {
    if (isEncrypted(row[f])) row[f] = JSON.parse(decrypt(row[f]));
  }
}

const base = new PrismaClient();

const isSqlite = (process.env.DATABASE_URL ?? '').startsWith('file:');

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, args, query }) {
        const enc = ENCRYPTED_FIELDS[model];
        const json = isSqlite ? JSON_FIELDS[model] : undefined;
        if (!enc && !json) return query(args);
        const a = args as any;
        const writes = [a.data, a.create, a.update].flat();
        // write: encrypt → JSON-encode; read: JSON-decode → decrypt
        if (enc) for (const d of writes) encryptFields(enc, d);
        if (json) for (const d of writes) encodeFields(json, d);
        const result = await query(args);
        for (const row of [result].flat()) {
          if (json) decodeFields(json, row);
          if (enc) decryptFields(enc, row);
        }
        return result;
      },
    },
  },
}) as unknown as PrismaClient;

/**
 * Encrypt credentials that versions before at-rest encryption stored in plaintext:
 * connector configs (re-saved so the extension encrypts them) and email passwords.
 * One unreadable row is logged and skipped rather than blocking the rest.
 */
export async function encryptLegacyCredentials(): Promise<number> {
  let count = 0;
  for (const row of await base.connectorConfig.findMany({ select: { id: true, config: true } })) {
    try {
      const stored = isSqlite && typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      if (isEncrypted(stored)) continue;
      await prisma.connectorConfig.update({ where: { id: row.id }, data: { config: stored as any } });
      count++;
    } catch (err) {
      console.error(`[crypto] Could not encrypt connector config "${row.id}":`, (err as Error).message);
    }
  }
  for (const row of await base.emailSettings.findMany({ select: { id: true, password: true } })) {
    if (!row.password || isEncrypted(row.password)) continue;
    try {
      await base.emailSettings.update({ where: { id: row.id }, data: { password: encrypt(row.password) } });
      count++;
    } catch (err) {
      console.error(`[crypto] Could not encrypt email password "${row.id}":`, (err as Error).message);
    }
  }
  return count;
}
