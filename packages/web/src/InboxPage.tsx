import React, { useEffect, useState } from "react";

type Task = {
  id: string; kind: "emergency" | "human" | "tool_failure" | "delivery_failed"; title: string; detail: string;
  createdAt: string; closedAt?: string; closedBy?: string; overdue: boolean; slaMinutes: number;
};
const KIND_LABEL: Record<Task["kind"], string> = { emergency: "Emergency", human: "Call back", tool_failure: "System error", delivery_failed: "n8n delivery" };

const age = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`;
};

// Human-in-the-loop inbox: what the agent handed to a person. Open tasks first; overdue ones are marked.
export function InboxPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const load = () => fetch("/api/inbox").then((r) => r.json()).then((body) => setTasks(body.data.tasks)).catch(() => setTasks([]));
  useEffect(() => {
    void load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);
  const close = async (id: string) => {
    await fetch(`/api/inbox/${id}/close`, { method: "POST" });
    void load();
  };

  const open = tasks?.filter((t) => !t.closedAt) ?? [];
  const shown = showClosed ? tasks ?? [] : open;
  return (
    <section aria-labelledby="inbox-title" style={{ display: "grid", gap: 14, maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
        <div>
          <h1 id="inbox-title" style={{ margin: 0, fontSize: 22 }}>Inbox</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>{open.length} open · callers and problems the AI handed to your team</p>
        </div>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed
        </label>
      </div>
      {!tasks && <p>Loading…</p>}
      {tasks && shown.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>Nothing waiting. New call-backs, emergencies and errors show up here.</p>}
      {shown.map((task) => (
        <article key={task.id} style={{
          display: "grid", gap: 6, padding: 14, borderRadius: 10, background: "var(--surface)",
          border: `1px solid ${task.kind === "emergency" && !task.closedAt ? "var(--danger)" : "var(--border)"}`, opacity: task.closedAt ? 0.6 : 1
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <strong>{task.title}</strong>
            <span style={{ fontSize: 12, color: task.overdue ? "var(--danger)" : "var(--text-tertiary)", whiteSpace: "nowrap" }}>
              {KIND_LABEL[task.kind]} · {age(task.createdAt)}{task.overdue ? ` · over ${task.slaMinutes} min target` : ""}
            </span>
          </div>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{task.detail}</span>
          {task.closedAt
            ? <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Closed by {task.closedBy} · {age(task.closedAt)}</span>
            : <button type="button" onClick={() => close(task.id)} style={{ justifySelf: "start", padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Mark done</button>}
        </article>
      ))}
    </section>
  );
}
