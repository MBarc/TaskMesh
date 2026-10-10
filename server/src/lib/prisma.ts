import { PrismaClient } from '@prisma/client';

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

const base = new PrismaClient();

const isSqlite = (process.env.DATABASE_URL ?? '').startsWith('file:');

export const prisma = (isSqlite
  ? base.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, args, query }) {
            const fields = JSON_FIELDS[model];
            if (!fields) return query(args);
            const a = args as any;
            for (const d of [a.data, a.create, a.update].flat()) encodeFields(fields, d);
            const result = await query(args);
            for (const row of [result].flat()) decodeFields(fields, row);
            return result;
          },
        },
      },
    })
  : base) as unknown as PrismaClient;
