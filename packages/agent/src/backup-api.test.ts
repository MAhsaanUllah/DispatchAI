import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseBackup } from "./backup.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-backup-api-"));
process.env.DATABASE_URL = join(dir, "api.sqlite");
delete process.env.MASTER_KEY;
const { handleRequest } = await import("./worker.js");
// Windows keeps open SQLite files locked; a leftover temp folder is harmless.
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

describe("GET /api/backup with a database file", () => {
  it("downloads one uncached file that restores to a valid backup, key included", async () => {
    const res = await handleRequest(new Request("http://localhost/api/backup", { headers: { "x-session-id": "owner" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="dispatchai-backup-\d{4}-\d{2}-\d{2}\.json"$/);
    const backup = parseBackup(await res.json());
    expect(backup.masterKey).toBeTruthy();
  });
});
