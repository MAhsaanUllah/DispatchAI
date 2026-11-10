import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Owner = { name: string; pinHash: string; salt: string; iterations: number; createdAt: string };

// OWASP 2023 guidance for PBKDF2-HMAC-SHA256.
const ITERATIONS = 600_000;
const toHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function hashPin(pin: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

// Constant-time string compare (via fixed-length SHA-256 digests).
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map(async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// One-time code shown in the server log on first start, e.g. "K7QM-3XPD". No 0/O/1/I to avoid misreading.
export function generateSetupCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// Owner account (single-tenant: exactly one owner). Same SQLite file as the business data; memory without a path.
export class AuthStore {
  private db?: DatabaseSync;
  private owner?: Owner;

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS owners (id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, pin_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL, created_at TEXT NOT NULL)");
  }

  private load(): Owner | undefined {
    if (!this.db) return this.owner;
    const row = this.db.prepare("SELECT name, pin_hash, salt, iterations, created_at FROM owners WHERE id = 1").get() as
      { name: string; pin_hash: string; salt: string; iterations: number; created_at: string } | undefined;
    return row && { name: row.name, pinHash: row.pin_hash, salt: row.salt, iterations: row.iterations, createdAt: row.created_at };
  }

  hasOwner(): boolean {
    return this.load() !== undefined;
  }

  // Returns false if an owner already exists (setup is one-time).
  async createOwner(name: string, pin: string): Promise<boolean> {
    if (this.hasOwner()) return false;
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const owner: Owner = { name, pinHash: await hashPin(pin, salt, ITERATIONS), salt, iterations: ITERATIONS, createdAt: new Date().toISOString() };
    if (!this.db) {
      if (this.owner) return false;
      this.owner = owner;
      return true;
    }
    // id = 1 CHECK + OR IGNORE: a racing second setup cannot create a second owner.
    const result = this.db.prepare("INSERT OR IGNORE INTO owners (id, name, pin_hash, salt, iterations, created_at) VALUES (1, ?, ?, ?, ?, ?)")
      .run(owner.name, owner.pinHash, owner.salt, owner.iterations, owner.createdAt);
    return Number(result.changes) === 1;
  }

  async verifyPin(pin: string): Promise<boolean> {
    const owner = this.load();
    if (!owner) return false;
    return safeEqual(await hashPin(pin, owner.salt, owner.iterations), owner.pinHash);
  }

  close(): void {
    this.db?.close();
  }
}
