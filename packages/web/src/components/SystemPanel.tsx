import React from "react";
import { BackupPanel } from "./BackupPanel.js";
import { BookingMeter } from "../BookingMeter.js";
import { BOOKING_STEPS, featureById, RUNS_ON, type RunsOn } from "../features.js";

type SystemPlugin = {
  id: string; name: string; enabled: boolean;
  status?: { text: string; warning: boolean };
};

type Health = {
  uptimeSeconds: number;
  database: { kind: "file" | "memory"; sizeBytes: number };
  inbox: { open: number; overdue: number };
  events: { pending: number; dead: number };
  bookings: { total: number; lastCreatedAt: string | null };
};

export type Problem = { text: string; go?: "features" | "inbox" };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// What needs the owner's attention right now, in plain words, each with where to fix it.
export function systemProblems(health: Health | null, plugins: SystemPlugin[] | null): Problem[] {
  const problems: Problem[] = [];
  if (health) {
    if (health.database.kind === "memory") problems.push({ text: "Data is kept in memory only, so it is lost when the server stops." });
    if (health.inbox.overdue > 0) problems.push({ text: `${plural(health.inbox.overdue, "task")} in the Inbox ${health.inbox.overdue === 1 ? "is" : "are"} overdue.`, go: "inbox" });
    if (health.events.dead > 0) problems.push({ text: `${plural(health.events.dead, "booking event")} did not reach your custom workflow.`, go: "features" });
  }
  for (const plugin of plugins ?? []) {
    if (plugin.enabled && plugin.status?.warning) problems.push({ text: `${plugin.name}: ${plugin.status.text}`, go: "features" });
  }
  return problems;
}

const duration = (seconds: number) => seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} min` : `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
const size = (bytes: number) => bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;

type StepState = "auto" | "live" | "off" | "failing";
const STEP_LABEL: Record<StepState, string> = { auto: "Automatic", live: "Live", off: "Off", failing: "Failing" };

export function SystemPanel({ onOpenPlugins, onOpenInbox, isOwner = false }: { onOpenPlugins: () => void; onOpenInbox?: () => void; isOwner?: boolean }) {
  const [health, setHealth] = React.useState<Health | null | "error">(null);
  const [plugins, setPlugins] = React.useState<SystemPlugin[] | null>(null);
  const [runsOn, setRunsOn] = React.useState<RunsOn>("desktop");

  React.useEffect(() => {
    const load = () => {
      fetch("/api/system").then((r) => (r.ok ? r.json() : Promise.reject())).then((body) => setHealth(body.data)).catch(() => setHealth("error"));
      if (isOwner) fetch("/api/plugins").then((r) => (r.ok ? r.json() : null)).then((body) => setPlugins(body?.data?.plugins ?? null)).catch(() => setPlugins(null));
    };
    load();
    fetch("/api/business").then((r) => r.json()).then((body) => setRunsOn(body.data.config.runsOn ?? "desktop")).catch(() => undefined);
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);

  const data = health === "error" ? null : health;
  const problems = systemProblems(data, plugins);
  const stateOf = (by: string | null): StepState | null => {
    if (!by) return "auto";
    if (!isOwner || !plugins) return null;
    const plugin = plugins?.find((p) => p.id === by);
    return !plugin?.enabled ? "off" : plugin.status?.warning ? "failing" : "live";
  };
  const liveIds = plugins?.filter((p) => p.enabled && !p.status?.warning).map((p) => p.id) ?? [];
  const where = RUNS_ON.find((option) => option.id === runsOn) ?? RUNS_ON[0];
  const go = (target?: "features" | "inbox") => (target === "inbox" ? onOpenInbox?.() : onOpenPlugins());

  const tiles = data ? [
    { label: "Server", value: `Up ${duration(data.uptimeSeconds)}`, warn: false },
    { label: "Database", value: data.database.kind === "memory" ? "In memory, not saved" : size(data.database.sizeBytes), warn: data.database.kind === "memory" },
    { label: "Inbox", value: `${data.inbox.open} open${data.inbox.overdue ? `, ${data.inbox.overdue} overdue` : ""}`, warn: data.inbox.overdue > 0 },
    { label: "Custom workflow", value: `${data.events.pending} waiting, ${data.events.dead} failed`, warn: data.events.dead > 0 },
    { label: "Bookings", value: data.bookings.lastCreatedAt ? `${data.bookings.total}, last ${new Date(data.bookings.lastCreatedAt).toLocaleDateString()}` : `${data.bookings.total}`, warn: false }
  ] : [];

  return (
    <section className="page" aria-labelledby="system-title">
      <div className="page__head">
        <div className="page__head-text">
          <h1 className="page__title" id="system-title">System</h1>
          <p className="page__lede">Is everything working? What runs, what is connected and where your data lives.</p>
        </div>
      </div>

      {health === "error" && <p role="alert" className="status status--warn">Could not read the server status. Is the server still running?</p>}
      {data && (
        <div role="status" className={`status ${problems.length === 0 ? "status--ok" : "status--warn"}`}>
          <h2 className="status__title">{problems.length === 0 ? "Everything is working." : `${plural(problems.length, "thing")} need${problems.length === 1 ? "s" : ""} attention.`}</h2>
          {problems.length > 0 && (
            <ul className="status__list">
              {problems.map((problem) => (
                <li key={problem.text}>
                  <span>{problem.text}</span>
                  {problem.go && <button type="button" className="btn btn--sm" onClick={() => go(problem.go)}>{problem.go === "inbox" ? "Open Inbox" : "Open Features"}</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {data && (
        <dl className="health" aria-label="System health">
          {tiles.map((tile) => (
            <div key={tile.label} className={`health__tile${tile.warn ? " health__tile--warn" : ""}`}>
              <dt>{tile.label}</dt>
              <dd>{tile.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="journey" aria-labelledby="journey-title">
        <div className="journey__head">
          <h2 className="journey__title" id="journey-title">What happens to a booking</h2>
          <p className="journey__lede">Nine steps, from the call to your own tools. Nothing is saved without the caller's clear yes.</p>
        </div>
        {isOwner && plugins && <BookingMeter live={liveIds} compact />}
        {!isOwner && <p className="field__hint">Only the owner can see which features are switched on.</p>}
        <ol className="journey__list">
          {BOOKING_STEPS.map((step, index) => {
            const state = stateOf(step.by);
            const feature = step.by ? featureById(step.by) : undefined;
            return (
              <li key={step.label} className="journey__row">
                <span className="journey__n" aria-hidden="true">{index + 1}</span>
                <span className="journey__body">
                  <span className="journey__name">{step.label}</span>
                  <span className="journey__by">{feature ? feature.name : "Built in, always on"}</span>
                </span>
                {state && <span className={`state state--${state}`}>{STEP_LABEL[state]}</span>}
                {isOwner && (state === "off" || state === "failing") && <button type="button" className="btn btn--sm" onClick={() => go("features")}>{state === "off" ? "Set up" : "Fix"}</button>}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="where" aria-labelledby="where-title">
        <h2 className="where__title" id="where-title">Where it runs: {where.title}</h2>
        <p className="where__summary">{where.summary}</p>
        <ul className="where__points">{where.points.map((point) => <li key={point}>{point}</li>)}</ul>
        <p className="field__hint">Your data is one database file on this machine{data && data.database.kind === "file" ? ` (${size(data.database.sizeBytes)})` : ""}. It never leaves unless you switch on a feature that sends it, and only the parts that feature needs.</p>
      </section>

      {isOwner && <BackupPanel />}
    </section>
  );
}
