import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// One file holds the whole business: the database and the key that decrypts the saved plugin keys.
export type Backup = { format: "dispatchai-backup"; version: 1; createdAt: string; database: string; masterKey: string | null };

const databaseFile = (databaseUrl: string) => resolve(databaseUrl.replace(/^file:/, ""));
const SQLITE_HEADER = "SQLite format 3\0";

// A consistent copy of the live database (VACUUM INTO is safe while the server is writing).
// A MASTER_KEY set in the environment is never written into a backup: keep it in your secret store.
export function createBackup(databaseUrl: string | undefined, now = new Date()): Backup | null {
  if (!databaseUrl || !existsSync(databaseFile(databaseUrl))) return null;
  const source = databaseFile(databaseUrl);
  const dir = mkdtempSync(join(tmpdir(), "dispatchai-backup-"));
  const copy = join(dir, "copy.sqlite");
  try {
    const db = new DatabaseSync(source);
    try { db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`); } finally { db.close(); }
    const keyFile = join(dirname(source), "master.key");
    return {
      format: "dispatchai-backup", version: 1, createdAt: now.toISOString(),
      database: readFileSync(copy).toString("base64"),
      masterKey: !process.env.MASTER_KEY && existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : null
    };
  } finally {
    // Windows can keep a SQLite file locked for a moment; a leftover temp folder is harmless.
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export function parseBackup(raw: unknown): Backup {
  const b = raw as Partial<Backup> | null;
  if (!b || b.format !== "dispatchai-backup" || b.version !== 1 || typeof b.database !== "string") throw new Error("This is not a DispatchAI backup file");
  if (b.masterKey !== null && typeof b.masterKey !== "string") throw new Error("This is not a DispatchAI backup file");
  if (Buffer.from(b.database, "base64").subarray(0, 16).toString("latin1") !== SQLITE_HEADER) throw new Error("The backup does not contain a database");
  return b as Backup;
}

// Restores into a stopped server's data folder. Nothing is ever deleted: with force, the old files are moved aside.
export function restoreBackup(raw: unknown, databaseUrl: string, force = false, now = Date.now()): { movedAside: string[] } {
  const backup = parseBackup(raw);
  const target = databaseFile(databaseUrl);
  const keyFile = join(dirname(target), "master.key");
  const files = [target, `${target}-wal`, `${target}-shm`, ...(backup.masterKey && !process.env.MASTER_KEY ? [keyFile] : [])];
  if (!force && existsSync(target)) throw new Error("A database already exists here. Stop the server and use force to move it aside.");
  mkdirSync(dirname(target), { recursive: true });
  const movedAside = files.filter(existsSync).map((file) => { const aside = `${file}.before-restore-${now}`; renameSync(file, aside); return aside; });
  writeFileSync(target, Buffer.from(backup.database, "base64"));
  if (backup.masterKey && !process.env.MASTER_KEY) writeFileSync(keyFile, backup.masterKey, { mode: 0o600 });
  return { movedAside };
}
