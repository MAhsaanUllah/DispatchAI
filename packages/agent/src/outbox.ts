import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { postSignedEvent } from "./outbound-events.js";

export type Delivery = {
  id: string; type: string; bookingId: string; status: "pending" | "delivered" | "dead";
  attempts: number; nextAttemptAt: number; lastError?: string; createdAt: string; deliveredAt?: string; body: string;
};
type Target = { url: string; secret: string } | undefined;

export const MAX_ATTEMPTS = 5;
// 30 s, 1 min, 2 min, 4 min between tries, then the event is parked as "dead" for a manual Retry.
export const backoffMs = (attempts: number) => 30_000 * 2 ** (attempts - 1);

// Durable queue for outgoing booking events: survives restarts and n8n downtime.
// shortcut: enqueued right after the booking is saved, not in the same SQLite transaction; a crash between the two loses one event.
export class Outbox {
  private db?: DatabaseSync;
  private mem: Delivery[] = [];
  private draining = false;

  constructor(databasePath: string | undefined, private target: () => Promise<Target>, private onDead?: (delivery: Delivery) => void) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, type TEXT NOT NULL, booking_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, last_error TEXT, created_at TEXT NOT NULL, delivered_at TEXT, body TEXT NOT NULL)");
  }

  private rows(where = "", ...args: (string | number)[]): Delivery[] {
    if (!this.db) return this.mem;
    return (this.db.prepare(`SELECT * FROM outbox ${where}`).all(...args) as Record<string, string | number | null>[]).map((r) => ({
      id: String(r.id), type: String(r.type), bookingId: String(r.booking_id), status: r.status as Delivery["status"], attempts: Number(r.attempts),
      nextAttemptAt: Number(r.next_attempt_at), lastError: r.last_error ? String(r.last_error) : undefined, createdAt: String(r.created_at),
      deliveredAt: r.delivered_at ? String(r.delivered_at) : undefined, body: String(r.body)
    }));
  }

  private write(d: Delivery): void {
    if (!this.db) {
      this.mem = [...this.mem.filter((x) => x.id !== d.id), d];
      return;
    }
    this.db.prepare("INSERT INTO outbox (id, type, booking_id, status, attempts, next_attempt_at, last_error, created_at, delivered_at, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, attempts = excluded.attempts, next_attempt_at = excluded.next_attempt_at, last_error = excluded.last_error, delivered_at = excluded.delivered_at")
      .run(d.id, d.type, d.bookingId, d.status, d.attempts, d.nextAttemptAt, d.lastError ?? null, d.createdAt, d.deliveredAt ?? null, d.body);
  }

  enqueue(event: { eventId: string; type: string; data: { bookingId: string } }, now = Date.now()): void {
    this.write({ id: event.eventId, type: event.type, bookingId: event.data.bookingId, status: "pending", attempts: 0, nextAttemptAt: now, createdAt: new Date(now).toISOString(), body: JSON.stringify(event) });
  }

  // Sends every due pending event once. Safe to call often; overlapping calls are skipped.
  async drain(now = Date.now()): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const due = this.rows("WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at", now).filter((d) => d.status === "pending" && d.nextAttemptAt <= now);
      if (due.length === 0) return;
      const target = await this.target();
      for (const d of due) {
        const result = target ? await postSignedEvent(target.url, target.secret, d.type, d.body) : { ok: false, error: "n8n plugin not connected" };
        const attempts = d.attempts + 1;
        const next: Delivery = result.ok
          ? { ...d, status: "delivered", attempts, lastError: undefined, deliveredAt: new Date(now).toISOString() }
          : { ...d, status: attempts >= MAX_ATTEMPTS ? "dead" : "pending", attempts, lastError: result.error, nextAttemptAt: now + backoffMs(attempts) };
        this.write(next);
        if (next.status === "dead") this.onDead?.(next);
      }
    } finally {
      this.draining = false;
    }
  }

  // Manual Retry from the dashboard: back to pending, due now.
  retry(id: string, now = Date.now()): boolean {
    const d = this.rows("WHERE id = ?", id).find((x) => x.id === id);
    if (!d || d.status === "delivered") return false;
    this.write({ ...d, status: "pending", nextAttemptAt: now });
    return true;
  }

  recent(limit = 20): Omit<Delivery, "body">[] {
    return this.rows("ORDER BY created_at DESC LIMIT ?", limit).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(({ body: _body, ...rest }) => rest);
  }
}
