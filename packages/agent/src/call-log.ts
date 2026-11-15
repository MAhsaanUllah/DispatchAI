import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type CallRecord = { id: string; from: string; startedAt: string; turns: number; silences: number; outcome: string };

// Phone calls kept in the same SQLite file as everything else, so history survives a restart. Memory when no path is given.
export class CallLog {
  private db?: DatabaseSync;
  private mem = new Map<string, CallRecord>();

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, from_masked TEXT NOT NULL, started_at TEXT NOT NULL, turns INTEGER NOT NULL, silences INTEGER NOT NULL, outcome TEXT NOT NULL)");
    this.db.exec("CREATE INDEX IF NOT EXISTS calls_started ON calls (started_at)");
  }

  save(call: CallRecord): void {
    if (!this.db) { this.mem.set(call.id, { ...call }); return; }
    this.db.prepare("INSERT OR REPLACE INTO calls (id, from_masked, started_at, turns, silences, outcome) VALUES (?, ?, ?, ?, ?, ?)")
      .run(call.id, call.from, call.startedAt, call.turns, call.silences, call.outcome);
  }

  recent(limit = 50): CallRecord[] {
    if (!this.db) return [...this.mem.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
    return (this.db.prepare("SELECT id, from_masked AS \"from\", started_at AS startedAt, turns, silences, outcome FROM calls ORDER BY started_at DESC LIMIT ?").all(limit) as unknown) as CallRecord[];
  }

  countSince(iso: string): number {
    if (!this.db) return [...this.mem.values()].filter((c) => c.startedAt >= iso).length;
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM calls WHERE started_at >= ?").get(iso) as { n: number }).n);
  }

  close(): void { this.db?.close(); }
}
