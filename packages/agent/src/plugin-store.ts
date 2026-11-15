import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type PluginRecord = { enabled: boolean; config: Record<string, string>; secrets: Record<string, string> };

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

// MASTER_KEY from .env (any string, hashed to 32 bytes). Without it, a random key is created once in
// master.key next to the database, so a copied database alone does not reveal plugin keys.
// shortcut: key file sits on the same disk as the database; on a VPS set MASTER_KEY from a secret store.
export function loadMasterKey(databasePath?: string): string {
  if (process.env.MASTER_KEY) return process.env.MASTER_KEY;
  if (!databasePath) return b64(crypto.getRandomValues(new Uint8Array(32)));
  const file = join(dirname(resolve(databasePath.replace(/^file:/, ""))), "master.key");
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, b64(crypto.getRandomValues(new Uint8Array(32))), { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

async function aesKey(masterKey: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(masterKey));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// Plugin settings. Non-secret config is plain JSON; secrets are AES-256-GCM encrypted and never leave the server.
export class PluginStore {
  private db?: DatabaseSync;
  private mem = new Map<string, { enabled: boolean; config: string; secrets: string }>();
  private key: Promise<CryptoKey>;

  constructor(databasePath?: string, masterKey = loadMasterKey(databasePath)) {
    this.key = aesKey(masterKey);
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS plugins (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, config TEXT NOT NULL, secrets TEXT NOT NULL, updated_at TEXT NOT NULL)");
  }

  private async encrypt(value: Record<string, string>): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await this.key, new TextEncoder().encode(JSON.stringify(value))));
    return `${b64(iv)}.${b64(data)}`;
  }

  private async decrypt(value: string): Promise<Record<string, string>> {
    if (!value) return {};
    const [iv, data] = value.split(".");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await this.key, unb64(data));
    return JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>;
  }

  async get(id: string): Promise<PluginRecord | undefined> {
    const row = this.db
      ? (this.db.prepare("SELECT enabled, config, secrets FROM plugins WHERE id = ?").get(id) as { enabled: number; config: string; secrets: string } | undefined)
      : this.mem.get(id);
    if (!row) return undefined;
    try {
      return { enabled: Boolean(row.enabled), config: JSON.parse(row.config), secrets: await this.decrypt(row.secrets) };
    } catch {
      // Wrong MASTER_KEY or damaged row: treat as not connected instead of crashing the server.
      return { enabled: false, config: JSON.parse(row.config), secrets: {} };
    }
  }

  async save(id: string, record: PluginRecord): Promise<void> {
    const row = { enabled: record.enabled, config: JSON.stringify(record.config), secrets: await this.encrypt(record.secrets) };
    if (!this.db) {
      this.mem.set(id, row);
      return;
    }
    this.db.prepare("INSERT INTO plugins (id, enabled, config, secrets, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, config = excluded.config, secrets = excluded.secrets, updated_at = excluded.updated_at")
      .run(id, row.enabled ? 1 : 0, row.config, row.secrets, new Date().toISOString());
  }
}
