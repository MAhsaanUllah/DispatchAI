import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { WorkOrder } from "@dispatchai/shared";

// One reminder per appointment time. Rescheduling changes scheduledStart, so the new time gets its own reminder.
export const reminderKey = (wo: Pick<WorkOrder, "id" | "scheduledStart">) => `${wo.id}@${wo.scheduledStart}`;

// Appointments whose reminder is due now. All maths is in UTC milliseconds, so DST changes cannot shift it:
// "24 hours before" means 24 real hours before. Overdue reminders (server was off) are still sent once if the
// appointment is still in the future; appointments already started are skipped.
export function dueReminders(workOrders: Iterable<WorkOrder>, hoursBefore: number, now: number, alreadySent: (key: string) => boolean): WorkOrder[] {
  const due: WorkOrder[] = [];
  for (const wo of workOrders) {
    if (wo.status !== "BOOKED" || !wo.scheduledStart) continue;
    const start = Date.parse(wo.scheduledStart);
    if (start <= now || start - hoursBefore * 3_600_000 > now || alreadySent(reminderKey(wo))) continue;
    due.push(wo);
  }
  return due;
}

// Which reminders went out; survives restarts so nothing is sent twice.
export class ReminderLog {
  private db?: DatabaseSync;
  private mem = new Set<string>();

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS reminders_sent (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL)");
  }

  has(key: string): boolean {
    return this.db ? !!this.db.prepare("SELECT 1 FROM reminders_sent WHERE key = ?").get(key) : this.mem.has(key);
  }

  // Marked before sending: at most once, even if the process dies mid-send.
  mark(key: string): void {
    if (this.db) this.db.prepare("INSERT OR IGNORE INTO reminders_sent (key, sent_at) VALUES (?, ?)").run(key, new Date().toISOString());
    else this.mem.add(key);
  }
}
