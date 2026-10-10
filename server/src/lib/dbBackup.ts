import fs from 'fs';
import path from 'path';

const KEEP = 3;

/**
 * Copy the SQLite file to `<db>.backup-<timestamp>` and keep only the newest KEEP
 * copies. Called at startup before the schema sync, while nothing has the database
 * open yet, so a plain file copy is consistent. Returns the backup path, or null if
 * there is no database file yet (fresh install).
 */
export function backupSqlite(dbFile: string, now = new Date()): string | null {
  if (!fs.existsSync(dbFile)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backup = `${dbFile}.backup-${stamp}`;
  fs.copyFileSync(dbFile, backup);

  const dir = path.dirname(dbFile);
  const prefix = `${path.basename(dbFile)}.backup-`;
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort(); // ISO stamps sort by time
  for (const old of backups.slice(0, -KEEP)) fs.rmSync(path.join(dir, old), { force: true });
  return backup;
}
