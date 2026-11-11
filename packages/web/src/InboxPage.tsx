import React, { useEffect, useState } from "react";

type Task = {
  id: string; kind: "emergency" | "human" | "tool_failure" | "delivery_failed"; title: string; detail: string;
  createdAt: string; closedAt?: string; closedBy?: string; overdue: boolean; slaMinutes: number;
};
const KIND_LABEL: Record<Task["kind"], string> = { emergency: "Emergency", human: "Call back", tool_failure: "System error", delivery_failed: "n8n delivery" };
const KIND_TONE: Record<Task["kind"], "alert" | "attention" | "closed"> = { emergency: "alert", human: "attention", tool_failure: "attention", delivery_failed: "attention" };

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
    <section className="page" aria-labelledby="inbox-title">
      <div className="page__head">
        <div>
          <h1 className="page__title" id="inbox-title">Inbox</h1>
          <p className="page__lede">{open.length} open. Callers and problems the AI handed to your team.</p>
        </div>
        <label className="check">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed
        </label>
      </div>

      {!tasks && <p className="page__lede">Loading…</p>}
      {tasks && shown.length === 0 && (
        <div className="record">
          <p className="drawer__text">Nothing waiting. New call-backs, emergencies and errors show up here.</p>
        </div>
      )}
      {shown.map((task) => (
        <article key={task.id} className={`task ${task.kind === "emergency" && !task.closedAt ? "task--alert" : ""} ${task.closedAt ? "task--done" : ""}`}>
          <div className="task__head">
            <h2 className="task__title">{task.title}</h2>
            <span className={`task__meta ${task.overdue ? "task__meta--overdue" : ""}`}>
              <span className={`swatch swatch--${KIND_TONE[task.kind]}`} aria-hidden="true" />
              {KIND_LABEL[task.kind]}
              <span>{age(task.createdAt)}</span>
              {task.overdue && <span>over {task.slaMinutes} min target</span>}
            </span>
          </div>
          <p className="task__detail">{task.detail}</p>
          {task.closedAt
            ? <span className="task__meta">Closed by {task.closedBy}, {age(task.closedAt)}</span>
            : <div className="task__actions">
              <button type="button" className="btn btn--sm" onClick={() => close(task.id)}>Mark done</button>
            </div>}
        </article>
      ))}
    </section>
  );
}
