import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BusinessConfigSchema, type BusinessConfig } from "@dispatchai/shared";

type Settings = { config?: BusinessConfig; firstBookingAt?: string };

// Business settings from onboarding, plus when the first real booking happened (locks template switching).
export class SettingsStore {
  private db?: DatabaseSync;
  private mem: Settings = {};

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS business_settings (id INTEGER PRIMARY KEY CHECK (id = 1), config TEXT, first_booking_at TEXT)");
  }

  load(): Settings {
    if (!this.db) return this.mem;
    const row = this.db.prepare("SELECT config, first_booking_at FROM business_settings WHERE id = 1").get() as
      { config: string | null; first_booking_at: string | null } | undefined;
    // Validate on read: a hand-edited or corrupt row must not crash the agent with a half-valid config.
    const parsed = row?.config ? BusinessConfigSchema.safeParse(JSON.parse(row.config)) : undefined;
    return { config: parsed?.success ? parsed.data : undefined, firstBookingAt: row?.first_booking_at ?? undefined };
  }

  saveConfig(config: BusinessConfig): void {
    if (!this.db) {
      this.mem = { ...this.mem, config };
      return;
    }
    this.db.prepare("INSERT INTO business_settings (id, config) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET config = excluded.config").run(JSON.stringify(config));
  }

  markFirstBooking(at = new Date().toISOString()): void {
    if (this.load().firstBookingAt) return;
    if (!this.db) {
      this.mem = { ...this.mem, firstBookingAt: at };
      return;
    }
    this.db.prepare("INSERT INTO business_settings (id, first_booking_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET first_booking_at = excluded.first_booking_at").run(at);
  }
}
