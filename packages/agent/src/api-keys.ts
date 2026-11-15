import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type ApiKeyScope = "read" | "write";
export type ApiKeyRow = { id: string; name: string; scope: ApiKeyScope; last4: string; createdAt: string; lastUsedAt?: string; revokedAt?: string };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const touchEveryMs = 60_000;

// Developer API keys for this one business. Only a SHA-256 of the key is stored (the key is 256 random bits, so a fast
// hash is enough), and the key itself is shown once, when it is created.
export class ApiKeyStore {
  private db?: DatabaseSync;
  private mem: (ApiKeyRow & { hash: string })[] = [];

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, scope TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, last4 TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT)");
  }

  create(name: string, scope: ApiKeyScope, now = new Date()): { key: string; row: ApiKeyRow } {
    const key = `dsp_${randomBytes(32).toString("base64url")}`;
    const row: ApiKeyRow = { id: randomUUID(), name, scope, last4: key.slice(-4), createdAt: now.toISOString() };
    if (this.db) this.db.prepare("INSERT INTO api_keys (id, name, scope, hash, last4, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(row.id, name, scope, sha256(key), row.last4, row.createdAt);
    else this.mem.push({ ...row, hash: sha256(key) });
    return { key, row };
  }

  list(): ApiKeyRow[] {
    const rows = this.db
      ? (this.db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all() as Record<string, string | null>[]).map((r) => ({
          id: String(r.id), name: String(r.name), scope: r.scope as ApiKeyScope, last4: String(r.last4), createdAt: String(r.created_at),
          lastUsedAt: r.last_used_at ?? undefined, revokedAt: r.revoked_at ?? undefined
        }))
      : this.mem.map(({ hash: _hash, ...row }) => row);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  revoke(id: string, now = new Date()): boolean {
    if (this.db) return Number(this.db.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now.toISOString(), id).changes) > 0;
    const row = this.mem.find((r) => r.id === id && !r.revokedAt);
    if (!row) return false;
    row.revokedAt = now.toISOString();
    return true;
  }

  // A missing, wrong or revoked key all look the same to the caller.
  verify(key: string, now = new Date()): ApiKeyRow | undefined {
    const hash = sha256(key);
    const row = this.db
      ? (() => {
          const r = this.db!.prepare("SELECT * FROM api_keys WHERE hash = ? AND revoked_at IS NULL").get(hash) as Record<string, string | null> | undefined;
          return r ? { id: String(r.id), name: String(r.name), scope: r.scope as ApiKeyScope, last4: String(r.last4), createdAt: String(r.created_at), lastUsedAt: r.last_used_at ?? undefined } : undefined;
        })()
      : this.mem.find((r) => r.hash === hash && !r.revokedAt);
    if (!row) return undefined;
    // Record "last used" at most once a minute so reads do not turn into writes.
    if (!row.lastUsedAt || now.getTime() - Date.parse(row.lastUsedAt) > touchEveryMs) {
      row.lastUsedAt = now.toISOString();
      if (this.db) this.db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(row.lastUsedAt, row.id);
    }
    const { hash: _hash, ...visible } = row as ApiKeyRow & { hash?: string };
    return visible;
  }
}
