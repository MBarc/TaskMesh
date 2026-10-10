import fs from 'fs';
import path from 'path';

const KEEP = 3;
// SQLite keeps uncommitted/unmerged data beside the main file; a backup needs them too.
const SIDE_FILES = ['-wal', '-journal'];

/**
 * Copy the SQLite file (plus any -wal / -journal beside it) to
 * `<db>.backup-<timestamp>[-wal|-journal]` and keep only the newest KEEP backups.
 * Called at startup before the schema sync, while nothing has the database open,
 * so plain file copies are consistent: SQLite replays the side file when the
 * backup is opened. Returns the backup path, or null on a fresh install.
 */
export function backupSqlite(dbFile: string, now = new Date()): string | null {
  if (!fs.existsSync(dbFile)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backup = `${dbFile}.backup-${stamp}`;
  fs.copyFileSync(dbFile, backup);
  for (const side of SIDE_FILES) {
    if (fs.existsSync(dbFile + side)) fs.copyFileSync(dbFile + side, backup + side);
  }

  const dir = path.dirname(dbFile);
  const prefix = `${path.basename(dbFile)}.backup-`;
  const stamps = [...new Set(
    fs.readdirSync(dir)
      .filter((f) => f.startsWith(prefix))
      .map((f) => f.slice(prefix.length).replace(/-(wal|journal)$/, '')),
  )].sort(); // ISO stamps sort by time
  for (const old of stamps.slice(0, -KEEP)) {
    for (const suffix of ['', ...SIDE_FILES]) fs.rmSync(path.join(dir, prefix + old + suffix), { force: true });
  }
  return backup;
}
