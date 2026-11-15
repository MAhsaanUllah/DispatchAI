import React, { useEffect, useState } from "react";
import { Inbox as InboxIcon, Check, Phone } from "lucide-react";

type Task = {
  id: string; kind: "emergency" | "human" | "tool_failure" | "delivery_failed"; title: string; detail: string; ref: string;
  createdAt: string; closedAt?: string; closedBy?: string; overdue: boolean; slaMinutes: number;
};
const KIND_LABEL: Record<Task["kind"], string> = { emergency: "Emergency", human: "Call back", tool_failure: "System error", delivery_failed: "n8n delivery" };
const KIND_TONE: Record<Task["kind"], "alert" | "attention" | "closed"> = { emergency: "alert", human: "attention", tool_failure: "attention", delivery_failed: "attention" };

const age = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`;
};

// The kind column already says what sort of task this is, so the title drops that prefix and
// carries the subject only: the caller, or what n8n could not deliver.
const KIND_PREFIX: Record<Task["kind"], RegExp> = {
  emergency: /^Possible emergency:\s*/,
  human: /^Call back:\s*/,
  tool_failure: /^Booking system error for\s*/,
  delivery_failed: /^n8n did not receive\s*/
};
const subjectOf = (task: Task): string => task.title.replace(KIND_PREFIX[task.kind], "").trim() || task.title;

// Staff work from a phone: when the task holds a caller's number, one tap dials it (tel: link).
export const phoneOf = (task: Pick<Task, "kind" | "title" | "detail">): string | undefined => {
  if (task.kind !== "human" && task.kind !== "emergency") return undefined;
  const found = /\+?\d[\d\s().-]{6,}\d/.exec(`${task.title} ${task.detail}`)?.[0];
  return found ? found.replace(/[^\d+]/g, "") : undefined;
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
        <div className="page__head-text">
          <div className="headline">
            <h1 className="page__title" id="inbox-title">Inbox</h1>
            <span className="tag">{open.length} open</span>
          </div>
          <p className="page__lede">Callers and problems the agent handed to your team.</p>
        </div>
        <div className="segmented" role="group" aria-label="Which tasks to show">
          <label className="segmented__item">
            <input className="visually-hidden" type="radio" name="inbox-scope" checked={!showClosed} onChange={() => setShowClosed(false)} />
            <span>Open</span>
          </label>
          <label className="segmented__item">
            <input className="visually-hidden" type="radio" name="inbox-scope" checked={showClosed} onChange={() => setShowClosed(true)} />
            <span>All</span>
          </label>
        </div>
      </div>

      {!tasks && <p className="page__lede">Loading tasks…</p>}
      {tasks && shown.length === 0 && (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true"><InboxIcon size={18} /></span>
          <p className="empty__title">{showClosed ? "No tasks yet." : "Nothing is waiting on you."}</p>
          <p className="empty__hint">Call-backs, emergencies and delivery errors land here.</p>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="task-list">
          {shown.map((task) => (
              <li key={task.id} className={`task ${task.kind === "emergency" && !task.closedAt ? "task--alert" : ""} ${task.closedAt ? "task--done" : ""}`}>
                <span className="task__kind">
                  <span className={`swatch swatch--${KIND_TONE[task.kind]}`} aria-hidden="true" />
                  {KIND_LABEL[task.kind]}
                </span>
                <span className="task__body">
                  <span className="task__title">{subjectOf(task)}</span>
                  <span className="task__detail">{task.detail}</span>
                </span>
                <span className="task__when">
                  {age(task.createdAt)}
                  {task.overdue && <span className="task__overdue">over {task.slaMinutes} min target</span>}
                </span>
                <span className="task__actions">
                  {task.closedAt
                    ? <span className="task__closed">Closed by {task.closedBy}, {age(task.closedAt)}</span>
                    : (
                      <>
                        {phoneOf(task) && <a className="btn btn--primary btn--sm" href={`tel:${phoneOf(task)}`}><Phone size={12} aria-hidden="true" />Call back</a>}
                        <button type="button" className="btn btn--sm" onClick={() => close(task.id)}><Check size={12} aria-hidden="true" />Done</button>
                      </>
                    )}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
