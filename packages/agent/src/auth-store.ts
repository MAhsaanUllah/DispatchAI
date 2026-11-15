import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Owner = { name: string; pinHash: string; salt: string; iterations: number; createdAt: string };
type StaffUser = { id: string; name: string; pinHash: string; salt: string; iterations: number; createdAt: string };
export type Role = "owner" | "staff";
export type SessionUser = { userId: string; role: Role; name: string };

// OWASP 2023 guidance for PBKDF2-HMAC-SHA256.
const ITERATIONS = 600_000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const SESSION_MS = 24 * 60 * 60 * 1000;
const sha256 = async (value: string) => toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
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

// Owner (exactly one, single-tenant) and staff logins. Same SQLite file as the business data; memory without a path.
export class AuthStore {
  private db?: DatabaseSync;
  private owner?: Owner;
  private memStaff = new Map<string, StaffUser>();
  private memSessions = new Map<string, { expiresAt: number; userId: string }>();
  // shortcut: lockout counters live in memory (single process), per login name; a restart needs server access anyway.
  private lockouts = new Map<string, { failures: number; lockedUntil: number }>();

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS owners (id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, pin_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS owner_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS staff_users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, pin_hash TEXT NOT NULL, salt TEXT NOT NULL, iterations INTEGER NOT NULL, created_at TEXT NOT NULL);
    `);
    // Sessions created before staff logins existed belong to the owner.
    try {
      this.db.exec("ALTER TABLE owner_sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner'");
    } catch {
      // column already exists
    }
  }

  private load(): Owner | undefined {
    if (!this.db) return this.owner;
    const row = this.db.prepare("SELECT name, pin_hash, salt, iterations, created_at FROM owners WHERE id = 1").get() as
      { name: string; pin_hash: string; salt: string; iterations: number; created_at: string } | undefined;
    return row && { name: row.name, pinHash: row.pin_hash, salt: row.salt, iterations: row.iterations, createdAt: row.created_at };
  }

  private staff(): StaffUser[] {
    if (!this.db) return [...this.memStaff.values()];
    return (this.db.prepare("SELECT * FROM staff_users ORDER BY created_at").all() as Record<string, string | number>[]).map((r) => ({
      id: String(r.id), name: String(r.name), pinHash: String(r.pin_hash), salt: String(r.salt), iterations: Number(r.iterations), createdAt: String(r.created_at)
    }));
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

  ownerName(): string | undefined {
    return this.load()?.name;
  }

  listStaff(): { id: string; name: string; createdAt: string }[] {
    return this.staff().map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  }

  // Name must be unique across owner and staff, because login is by name + PIN.
  async createStaff(name: string, pin: string): Promise<{ id: string } | { error: "NAME_TAKEN" }> {
    const lower = name.toLowerCase();
    if (this.ownerName()?.toLowerCase() === lower || this.staff().some((s) => s.name.toLowerCase() === lower)) return { error: "NAME_TAKEN" };
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const user: StaffUser = { id: `user_${crypto.randomUUID()}`, name, pinHash: await hashPin(pin, salt, ITERATIONS), salt, iterations: ITERATIONS, createdAt: new Date().toISOString() };
    if (this.db) {
      this.db.prepare("INSERT INTO staff_users (id, name, pin_hash, salt, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(user.id, user.name, user.pinHash, user.salt, user.iterations, user.createdAt);
    } else this.memStaff.set(user.id, user);
    return { id: user.id };
  }

  // Removing a login also ends every open session of that person.
  removeStaff(id: string): boolean {
    if (!this.staff().some((s) => s.id === id)) return false;
    if (this.db) {
      this.db.prepare("DELETE FROM staff_users WHERE id = ?").run(id);
      this.db.prepare("DELETE FROM owner_sessions WHERE user_id = ?").run(id);
    } else {
      this.memStaff.delete(id);
      for (const [hash, session] of this.memSessions) if (session.userId === id) this.memSessions.delete(hash);
    }
    return true;
  }

  // Login by name + PIN (empty name = owner). 5 wrong PINs for a name lock that name for 15 minutes.
  async login(pin: string, name = "", now = Date.now()): Promise<{ token: string } | { error: "LOCKED" | "WRONG_PIN"; retryAfterMs?: number }> {
    const wanted = name.trim().toLowerCase();
    const owner = this.load();
    const user = !wanted || wanted === owner?.name.toLowerCase()
      ? owner && { id: "owner", pinHash: owner.pinHash, salt: owner.salt, iterations: owner.iterations }
      : this.staff().find((s) => s.name.toLowerCase() === wanted);
    const key = user?.id ?? `unknown:${wanted}`;
    const lock = this.lockouts.get(key) ?? { failures: 0, lockedUntil: 0 };
    if (now < lock.lockedUntil) return { error: "LOCKED", retryAfterMs: lock.lockedUntil - now };
    const ok = user ? await safeEqual(await hashPin(pin, user.salt, user.iterations), user.pinHash) : false;
    if (!ok || !user) {
      lock.failures += 1;
      if (lock.failures >= MAX_FAILURES) {
        this.lockouts.set(key, { failures: 0, lockedUntil: now + LOCK_MS });
        return { error: "LOCKED", retryAfterMs: LOCK_MS };
      }
      this.lockouts.set(key, lock);
      return { error: "WRONG_PIN" };
    }
    this.lockouts.delete(key);
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256(token);
    const expiresAt = now + SESSION_MS;
    if (this.db) {
      this.db.prepare("DELETE FROM owner_sessions WHERE expires_at <= ?").run(now);
      this.db.prepare("INSERT INTO owner_sessions (token_hash, expires_at, user_id) VALUES (?, ?, ?)").run(tokenHash, expiresAt, user.id);
    } else this.memSessions.set(tokenHash, { expiresAt, userId: user.id });
    return { token };
  }

  // Who a session belongs to. Only the hash of the token is stored, so a copied database cannot be used to log in.
  async session(token: string | undefined, now = Date.now()): Promise<SessionUser | undefined> {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return undefined;
    const tokenHash = await sha256(token);
    let row: { expires_at: number; user_id: string } | undefined;
    if (this.db) {
      row = this.db.prepare("SELECT expires_at, user_id FROM owner_sessions WHERE token_hash = ?").get(tokenHash) as typeof row;
    } else {
      const s = this.memSessions.get(tokenHash);
      row = s && { expires_at: s.expiresAt, user_id: s.userId };
    }
    if (!row || row.expires_at <= now) return undefined;
    if (row.user_id === "owner") return { userId: "owner", role: "owner", name: this.ownerName() ?? "Owner" };
    const staff = this.staff().find((s) => s.id === row!.user_id);
    return staff && { userId: staff.id, role: "staff", name: staff.name };
  }

  async isValidSession(token: string | undefined, now = Date.now()): Promise<boolean> {
    return (await this.session(token, now)) !== undefined;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const tokenHash = await sha256(token);
    if (this.db) this.db.prepare("DELETE FROM owner_sessions WHERE token_hash = ?").run(tokenHash);
    else this.memSessions.delete(tokenHash);
  }

  close(): void {
    this.db?.close();
  }
}
