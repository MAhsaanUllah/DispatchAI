import React, { useEffect, useState } from "react";
import { Workflow, Mail, Sparkles, BellRing, PhoneCall, Plug, Unplug, type LucideIcon } from "lucide-react";
import { BookingMeter } from "./BookingMeter.js";
import { FEATURES, GROUPS, phoneNote, type RunsOn } from "./features.js";

type Field = { key: string; label: string; secret: boolean; placeholder?: string; help?: string; value: string; saved?: boolean; options?: { value: string; label: string }[] };
type Plugin = {
  id: string; name: string; category: string; description: string; limits: string; enabled: boolean; fields: Field[];
  preview?: { title: string; text: string }[];
  status?: { text: string; warning: boolean };
};
type Status = { kind: "ok" | "error" | "info"; text: string } | null;

type Delivery = { id: string; type: string; bookingId: string; status: "pending" | "delivered" | "dead"; attempts: number; lastError?: string; createdAt: string };
const STATUS_LABEL = { delivered: "Delivered", pending: "Retrying", dead: "Failed" } as const;

// One mark per plugin, so the catalogue reads as a set of tools rather than a list of words.
const PLUGIN_ICON: Record<string, LucideIcon> = {
  n8n: Workflow,
  email: Mail,
  ai: Sparkles,
  reminders: BellRing,
  twilio: PhoneCall
};

// Last 20 events sent to n8n, with a manual Retry for ones that did not get through.
function DeliveryLog() {
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const load = () => fetch("/api/plugins/n8n/deliveries").then((r) => r.json()).then((body) => setRows(body.data.deliveries)).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  const retry = async (id: string) => {
    await fetch(`/api/plugins/n8n/deliveries/${id}/retry`, { method: "POST" });
    void load();
  };
  if (!rows) return null;
  return (
    <details className="log" open={rows.some((row) => row.status !== "delivered")}>
      <summary>Recent deliveries ({rows.length})</summary>
      {rows.length === 0 ? <p className="plugin__status">No events sent yet. They appear here after the next booking.</p> : (
        <table>
          <thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">Booking</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Retry</span></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.type}</td>
                <td>{row.bookingId.replace(/^wo_/, "WO-")}</td>
                <td className={row.status === "dead" ? "log__failed" : undefined}>
                  {STATUS_LABEL[row.status]}{row.status !== "delivered" && row.lastError ? ` (${row.lastError}, ${row.attempts} tries)` : ""}
                </td>
                <td>{row.status !== "delivered" && <button type="button" className="btn btn--sm" onClick={() => retry(row.id)}>Retry</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

type Call = { id: string; from: string; startedAt: string; turns: number; silences: number; outcome: string };

// Last 20 phone calls since the server started (caller number masked).
function CallLog() {
  const [calls, setCalls] = useState<Call[] | null>(null);
  useEffect(() => {
    fetch("/api/plugins/twilio/calls").then((r) => r.json()).then((body) => setCalls(body.data.calls)).catch(() => setCalls([]));
  }, []);
  if (!calls) return null;
  return (
    <details className="log">
      <summary>Recent calls ({calls.length})</summary>
      {calls.length === 0 ? <p className="plugin__status">No calls yet since the server started.</p> : (
        <table>
          <thead><tr><th scope="col">When</th><th scope="col">From</th><th scope="col">Turns</th><th scope="col">Outcome</th></tr></thead>
          <tbody>{calls.map((call) => (
            <tr key={call.id}>
              <td>{new Date(call.startedAt).toLocaleString()}</td><td>{call.from}</td><td>{call.turns}</td><td>{call.outcome}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </details>
  );
}

type Health = { ok: boolean; text: string };

const save = async (plugin: Plugin, values: Record<string, string>, enabled: boolean) => {
  const response = await fetch(`/api/plugins/${plugin.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values, enabled }) });
  const body = await response.json().catch(() => ({}));
  return response.ok ? null : (body?.error?.message as string) || "Could not save.";
};
const runTest = async (plugin: Plugin): Promise<Health> => {
  try {
    const body = await fetch(`/api/plugins/${plugin.id}/test`, { method: "POST" }).then((r) => r.json());
    return { ok: !!body?.data?.ok, text: body?.data?.message ?? "Test failed." };
  } catch {
    return { ok: false, text: "Cannot reach the DispatchAI server." };
  }
};

// Settings drawer: fill the fields, then "Save & Test". A failed test disconnects again, so only working plugins sit in "My system".
function PluginDrawer({ plugin, onClose, onDone }: { plugin: Plugin; onClose: () => void; onDone: (health: Health) => void }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(plugin.fields.map((f) => [f.key, f.value])));
  const [message, setMessage] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const panel = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);

  const saveAndTest = async () => {
    setBusy(true);
    setMessage({ kind: "info", text: "Saving and testing…" });
    const problem = await save(plugin, values, true);
    if (problem) {
      setBusy(false);
      return setMessage({ kind: "error", text: problem });
    }
    const health = await runTest(plugin);
    if (!health.ok && !plugin.enabled) await save(plugin, {}, false); // new connection failed: back to Available
    setBusy(false);
    if (!health.ok) return setMessage({ kind: "error", text: health.text });
    onDone(health);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby={`drawer-${plugin.id}`}>
      <div className="drawer drawer--wide" ref={panel} tabIndex={-1}>
        <div className="drawer__head">
          <h2 className="drawer__id" id={`drawer-${plugin.id}`}>{plugin.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="modal__close">×</button>
        </div>
        <div className="drawer__body">
          <p className="drawer__text">{plugin.description}</p>
          {plugin.fields.map((field) => (
            <label key={field.key} className="field">
              <span className="field__label">{field.label}</span>
              {field.options ? (
                <select className="select" aria-label={field.label} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}>
                  <option value="">Choose…</option>
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <input
                  className="input"
                  aria-label={field.label}
                  type={field.secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={field.secret && field.saved ? "Saved, leave empty to keep" : field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                />
              )}
              {field.help && <span className="field__hint">{field.help}</span>}
            </label>
          ))}
          {plugin.preview && (
            <details className="log">
              <summary>Preview what customers receive</summary>
              {plugin.preview.map((sample) => (
                <div key={sample.title} className="gate__what">
                  <strong>{sample.title}</strong>
                  <span>{sample.text}</span>
                </div>
              ))}
            </details>
          )}
          <p className="field__hint">Limits: {plugin.limits}</p>
          {message && <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "field__error" : "field__hint"}>{message.text}</p>}
          <div className="gate__actions">
            <button type="button" disabled={busy} onClick={saveAndTest} className="btn btn--primary">{busy ? "Working…" : "Save & Test"}</button>
            <button type="button" disabled={busy} onClick={onClose} className="btn">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type State = "live" | "failing" | "needs-key" | "off";
const STATE_LABEL: Record<State, string> = { live: "Live", failing: "Failing", "needs-key": "Needs a key", off: "Off" };

// What the owner sees at a glance: is it doing its job right now?
const stateOf = (plugin: Plugin, health?: Health): State => {
  if (plugin.enabled) return (health && !health.ok) || plugin.status?.warning ? "failing" : "live";
  return plugin.fields.some((field) => field.secret && !field.saved) ? "needs-key" : "off";
};

// Features page: grouped by what the owner wants done. Each card says what it does, whether it works now,
// and what changes when it is on. Add / Settings / Test / Remove are plain buttons, so keyboard and touch work.
export function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[] | null>(null);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<Plugin | null>(null);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);
  const [runsOn, setRunsOn] = useState<RunsOn>("desktop");

  const load = () => fetch("/api/plugins").then((r) => r.json()).then((body) => setPlugins(body.data.plugins)).catch(() => setError("Cannot load features."));
  useEffect(() => {
    void load();
    fetch("/api/business").then((r) => r.json()).then((body) => setRunsOn(body.data.config.runsOn ?? "desktop")).catch(() => undefined);
  }, []);

  // The connect/disconnect result is stated once, then it goes quiet.
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2800);
    return () => clearTimeout(timer);
  }, [flash]);

  const remove = async (plugin: Plugin) => {
    if (!window.confirm(`Switch off ${plugin.name}? It stops working until you add it again. Saved keys are kept.`)) return;
    const problem = await save(plugin, {}, false);
    if (problem) setError(problem);
    else setFlash({ id: plugin.id, text: `${plugin.name} is off` });
    void load();
  };
  const test = async (plugin: Plugin) => {
    setHealth((current) => ({ ...current, [plugin.id]: { ok: true, text: "Testing…" } }));
    const result = await runTest(plugin);
    setHealth((current) => ({ ...current, [plugin.id]: result }));
  };

  const liveIds = plugins?.filter((p) => stateOf(p, health[p.id]) === "live").map((p) => p.id) ?? [];
  return (
    <section className="page" aria-labelledby="features-title">
      <div className="page__head">
        <div className="page__head-text">
          <h1 className="page__title" id="features-title">Features</h1>
          <p className="page__lede">Switch on what you need. Each one automates one more step of a booking. Keys stay encrypted on this server and are never shown again.</p>
        </div>
      </div>
      {error && <p role="alert" className="field__error">{error}</p>}
      {!plugins && !error && <p className="page__lede">Loading features…</p>}
      {plugins && (
        <>
          <BookingMeter live={liveIds} compact />
          <div className="feature-groups">
          {GROUPS.map((group) => {
            const items = FEATURES.filter((feature) => feature.group === group.title);
            return (
              <section key={group.title} className="feature-group" aria-labelledby={`group-${group.title}`}>
                <div className="feature-group__head">
                  <h2 className="feature-group__title" id={`group-${group.title}`}>{group.title}</h2>
                  <p className="feature-group__purpose">{group.purpose}</p>
                </div>
                <div className="features">
                  {items.map((feature, index) => {
                    const plugin = plugins.find((p) => p.id === feature.id);
                    if (!plugin) return null;
                    const h = health[plugin.id];
                    const state = stateOf(plugin, h);
                    const Icon = PLUGIN_ICON[plugin.id] ?? Plug;
                    const on = plugin.enabled;
                    return (
                      <article key={plugin.id} aria-label={feature.name} style={{ animationDelay: `${index * 55}ms` }} className={`feature feature--${state}`}>
                        <div className="feature__top">
                          <span className="feature__icon" aria-hidden="true"><Icon size={16} /></span>
                          <h3 className="feature__name">{feature.name}</h3>
                          <span className={`state state--${state}`}>{STATE_LABEL[state]}</span>
                        </div>
                        <p className="feature__kind">{feature.kind === "custom" ? "Custom workflow" : "Built-in"}</p>
                        <p className="feature__benefit">{feature.benefit}</p>
                        {plugin.id === "twilio" && <p className="feature__note">{phoneNote(runsOn)}</p>}
                        <details className="feature__more">
                          <summary>What changes when this is on</summary>
                          <p>{feature.changes}</p>
                        </details>
                        {h && <p role={h.ok ? "status" : "alert"} className={`feature__status ${h.ok ? "" : "feature__status--failed"}`}>{h.text}</p>}
                        {plugin.status && <p className={`feature__status ${plugin.status.warning ? "feature__status--failed" : ""}`}>{plugin.status.text}</p>}
                        {flash?.id === plugin.id && <p className="feature__flash" role="status">{flash.text}</p>}
                        <div className="feature__actions">
                          {on ? (
                            <>
                              <button type="button" className="btn btn--sm" onClick={() => setDrawer(plugin)}>Settings</button>
                              <button type="button" className="btn btn--sm" onClick={() => test(plugin)}>Test</button>
                              <button type="button" className="btn btn--sm" onClick={() => remove(plugin)}><Unplug size={12} aria-hidden="true" />Switch off</button>
                            </>
                          ) : (
                            <button type="button" className="btn btn--primary btn--sm" onClick={() => setDrawer(plugin)}>Add</button>
                          )}
                        </div>
                        {on && plugin.id === "n8n" && <DeliveryLog />}
                        {on && plugin.id === "twilio" && <CallLog />}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
          </div>
          <section className="explainer" aria-labelledby="else-title">
            <h2 className="explainer__title" id="else-title">Need something else?</h2>
            <ol className="explainer__steps">
              <li><strong>Built-in features.</strong> Switch one on above. Nothing to write.</li>
              <li><strong>Custom workflow.</strong> Connect n8n to send each booking to Sheets, WhatsApp, a CRM or anything n8n can reach. Host n8n on your cloud server or use n8n Cloud.</li>
              <li><strong>Your own code.</strong> A developer API is not part of this version.</li>
            </ol>
          </section>
        </>
      )}
      {drawer && (
        <PluginDrawer
          plugin={drawer}
          onClose={() => { setDrawer(null); void load(); }}
          onDone={(result) => { setHealth((current) => ({ ...current, [drawer.id]: result })); setFlash({ id: drawer.id, text: `${drawer.name} is on` }); setDrawer(null); void load(); }}
        />
      )}
    </section>
  );
}
