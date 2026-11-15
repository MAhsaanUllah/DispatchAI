import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TaskKind = "emergency" | "human" | "tool_failure" | "delivery_failed";
export type Task = {
  id: string; kind: TaskKind; title: string; detail: string; ref: string;
  createdAt: string; closedAt?: string; closedBy?: string;
};

// Minutes before an open task counts as overdue (shown in the inbox).
export const SLA_MINUTES: Record<TaskKind, number> = { emergency: 15, human: 120, tool_failure: 240, delivery_failed: 240 };

// Human-in-the-loop inbox: things the agent could not or should not finish alone.
export class Inbox {
  private db?: DatabaseSync;
  private mem: Task[] = [];

  constructor(databasePath?: string) {
    if (!databasePath) return;
    const path = resolve(databasePath.replace(/^file:/, ""));
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS hitl_tasks (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, ref TEXT NOT NULL, created_at TEXT NOT NULL, closed_at TEXT, closed_by TEXT)");
  }

  list(): Task[] {
    if (!this.db) return [...this.mem].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return (this.db.prepare("SELECT * FROM hitl_tasks ORDER BY created_at DESC LIMIT 200").all() as Record<string, string | null>[]).map((r) => ({
      id: String(r.id), kind: r.kind as TaskKind, title: String(r.title), detail: String(r.detail), ref: String(r.ref),
      createdAt: String(r.created_at), closedAt: r.closed_at ?? undefined, closedBy: r.closed_by ?? undefined
    }));
  }

  // One open task per kind + ref (session id, booking id or event id): repeats do not spam the inbox.
  add(kind: TaskKind, ref: string, title: string, detail: string, now = new Date().toISOString()): Task | undefined {
    if (this.list().some((t) => t.kind === kind && t.ref === ref && !t.closedAt)) return undefined;
    const task: Task = { id: `task_${crypto.randomUUID()}`, kind, title, detail: detail.slice(0, 500), ref, createdAt: now };
    if (this.db) this.db.prepare("INSERT INTO hitl_tasks (id, kind, title, detail, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(task.id, kind, title, task.detail, ref, now);
    else this.mem.push(task);
    return task;
  }

  close(id: string, by: string, now = new Date().toISOString()): boolean {
    const task = this.list().find((t) => t.id === id);
    if (!task || task.closedAt) return false;
    if (this.db) this.db.prepare("UPDATE hitl_tasks SET closed_at = ?, closed_by = ? WHERE id = ?").run(now, by, id);
    else Object.assign(task, { closedAt: now, closedBy: by });
    return true;
  }
}
