import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createBackup, parseBackup, restoreBackup } from "./backup.js";
import { handleRequest } from "./worker.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-backup-test-"));
// Windows keeps open SQLite files locked; a leftover temp folder is harmless.
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
afterEach(() => { delete process.env.MASTER_KEY; });

function makeInstall(name: string, rows: string[]) {
  const folder = join(dir, name);
  const path = join(folder, "dispatchai.sqlite");
  mkdirSync(folder, { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE notes (text TEXT)");
  for (const row of rows) db.prepare("INSERT INTO notes VALUES (?)").run(row);
  db.close();
  writeFileSync(join(folder, "master.key"), "key-abc");
  return path;
}
const notes = (path: string) => { const db = new DatabaseSync(path); const rows = db.prepare("SELECT text FROM notes ORDER BY text").all().map((r: any) => r.text); db.close(); return rows; };

describe("backup and restore", () => {
  it("round-trips the database and the key file", () => {
    const backup = createBackup(makeInstall("a", ["one", "two"]))!;
    expect(backup).toMatchObject({ format: "dispatchai-backup", version: 1, masterKey: "key-abc" });

    const target = join(dir, "restored", "dispatchai.sqlite");
    restoreBackup(JSON.parse(JSON.stringify(backup)), target);
    expect(notes(target)).toEqual(["one", "two"]);
    expect(readFileSync(join(dir, "restored", "master.key"), "utf8")).toBe("key-abc");
  });

  it("leaves a MASTER_KEY from the environment out of the file", () => {
    process.env.MASTER_KEY = "from-env";
    expect(createBackup(makeInstall("b", ["x"]))!.masterKey).toBeNull();
  });

  it("returns nothing for an in-memory server", () => {
    expect(createBackup(undefined)).toBeNull();
    expect(createBackup(join(dir, "missing.sqlite"))).toBeNull();
  });

  it("rejects files that are not backups", () => {
    expect(() => parseBackup({ hello: 1 })).toThrow(/not a DispatchAI backup/);
    expect(() => parseBackup({ format: "dispatchai-backup", version: 1, database: Buffer.from("not sqlite").toString("base64"), masterKey: null })).toThrow(/does not contain a database/);
  });

  it("never overwrites silently: refuses, then moves the old files aside with force", () => {
    const backup = createBackup(makeInstall("c", ["old"]))!;
    const target = makeInstall("d", ["current"]);
    expect(() => restoreBackup(backup, target)).toThrow(/already exists/);
    expect(notes(target)).toEqual(["current"]);

    const { movedAside } = restoreBackup(backup, target, true, 1);
    expect(notes(target)).toEqual(["old"]);
    expect(movedAside.some((file) => file.endsWith("dispatchai.sqlite.before-restore-1"))).toBe(true);
    expect(existsSync(movedAside[0])).toBe(true);
  });
});

describe("GET /api/backup", () => {
  it("says there is nothing to back up when the server has no database file", async () => {
    const res = await handleRequest(new Request("http://localhost/api/backup", { headers: { "x-session-id": "owner" } }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error.code).toBe("NO_DATABASE_FILE");
  });
});
