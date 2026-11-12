import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Workflow, Mail, Sparkles, BellRing, PhoneCall, Plug, Unplug, type LucideIcon } from "lucide-react";

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
      <div className="drawer drawer--wide">
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

// Plugins page: drag a card from "Available" into "My system" to connect it (or use the Add button);
// drag it back (or Remove) to disconnect. Buttons give the same actions for keyboard and touch users.
export function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[] | null>(null);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<Plugin | null>(null);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [over, setOver] = useState<"available" | "system" | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; text: string; on: boolean } | null>(null);

  // Card positions, kept so a plugin can slide from one zone to the other instead of jumping.
  const cards = useRef(new Map<string, HTMLElement>());
  const flip = useRef<{ id: string; rect: DOMRect } | null>(null);
  const cardRef = useCallback((node: HTMLElement | null) => {
    const id = node?.dataset.pluginId;
    if (!id) return;
    if (node) cards.current.set(id, node);
    else cards.current.delete(id);
  }, []);

  const load = () => fetch("/api/plugins").then((r) => r.json()).then((body) => setPlugins(body.data.plugins)).catch(() => setError("Cannot load plugins."));
  useEffect(() => { void load(); }, []);

  // The card moved zone: play the move from where it was to where it landed.
  useLayoutEffect(() => {
    const pending = flip.current;
    if (!pending) return;
    flip.current = null;
    const node = cards.current.get(pending.id);
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const landed = node.getBoundingClientRect();
    const dx = pending.rect.left - landed.left;
    const dy = pending.rect.top - landed.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    node.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.2 }, { transform: "translate(0, 0)", opacity: 1 }],
      { duration: 300, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    );
  }, [plugins]);

  // The connect/disconnect result is stated once, then it goes quiet.
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2800);
    return () => clearTimeout(timer);
  }, [flash]);

  const capture = (id: string) => {
    const node = cards.current.get(id);
    if (node) flip.current = { id, rect: node.getBoundingClientRect() };
  };

  const remove = async (plugin: Plugin) => {
    if (!window.confirm(`Disconnect ${plugin.name}? It stops working until you add it again. Saved keys are kept.`)) return;
    capture(plugin.id);
    const problem = await save(plugin, {}, false);
    if (problem) setError(problem);
    else setFlash({ id: plugin.id, text: `${plugin.name} disconnected`, on: false });
    void load();
  };
  const openDrawer = (plugin: Plugin) => {
    capture(plugin.id);
    setDrawer(plugin);
  };
  const test = async (plugin: Plugin) => {
    setHealth((current) => ({ ...current, [plugin.id]: { ok: true, text: "Testing…" } }));
    const result = await runTest(plugin);
    setHealth((current) => ({ ...current, [plugin.id]: result }));
  };
  const drop = (zone: "available" | "system") => (event: React.DragEvent) => {
    event.preventDefault();
    setOver(null);
    setDragging(null);
    const plugin = plugins?.find((p) => p.id === event.dataTransfer.getData("text/plain"));
    if (!plugin) return;
    if (zone === "system" && !plugin.enabled) openDrawer(plugin);
    if (zone === "available" && plugin.enabled) void remove(plugin);
  };
  const zoneProps = (zone: "available" | "system") => ({
    onDragOver: (event: React.DragEvent) => { event.preventDefault(); setOver(zone); },
    onDragLeave: () => setOver((current) => (current === zone ? null : current)),
    onDrop: drop(zone),
    className: `zone ${over === zone ? "zone--over" : ""}`
  });
  const dragProps = (plugin: Plugin) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => { event.dataTransfer.setData("text/plain", plugin.id); setDragging(plugin.id); },
    onDragEnd: () => { setDragging(null); setOver(null); }
  });

  const available = plugins?.filter((p) => !p.enabled) ?? [];
  const connected = plugins?.filter((p) => p.enabled) ?? [];
  return (
    <section className="page" aria-labelledby="plugins-title">
      <div className="page__head">
        <div className="page__head-text">
          <h1 className="page__title" id="plugins-title">Plugins</h1>
          <p className="page__lede">Connect the tools your business runs on. Keys stay encrypted on this server and are never shown again.</p>
        </div>
      </div>
      {error && <p role="alert" className="field__error">{error}</p>}
      {!plugins && !error && <p className="page__lede">Loading plugins…</p>}
      {plugins && (
        <div className={`zones ${dragging ? "zones--dragging" : ""}`}>
          <section aria-labelledby="available-title" {...zoneProps("available")}>
            <div className="zone__head">
              <h2 className="zone__title" id="available-title">Available <span className="zone__count">{available.length}</span></h2>
              {over === "available" && <span className="zone__drop">Drop to disconnect</span>}
            </div>
            {available.length === 0 && <p className="zone__hint">Everything is connected.</p>}
            {available.length > 0 && (
              <div className="grid grid--wide zone__cards">
                {available.map((plugin) => {
                  const Icon = PLUGIN_ICON[plugin.id] ?? Plug;
                  return (
                    <article key={plugin.id} data-plugin-id={plugin.id} ref={cardRef} aria-label={plugin.name} {...dragProps(plugin)} className={`plugin ${dragging === plugin.id ? "plugin--dragging" : ""}`}>
                      <div className="plugin__top">
                        <span className="plugin__icon" aria-hidden="true"><Icon size={16} /></span>
                        <strong className="plugin__name">{plugin.name}</strong>
                      </div>
                      <span className="plugin__category">{plugin.category}</span>
                      <p className="plugin__desc" title={plugin.description}>{plugin.description}</p>
                      <div className="plugin__actions">
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => openDrawer(plugin)}>Add</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <section aria-labelledby="system-title" {...zoneProps("system")}>
            <div className="zone__head">
              <h2 className="zone__title" id="system-title">My system <span className="zone__count">{connected.length}</span></h2>
              {over === "system" && <span className="zone__drop">Drop to connect</span>}
            </div>
            {connected.length === 0 && <p className="zone__hint">Nothing connected yet. Drag a plugin here, or press Add.</p>}
            {connected.length > 0 && (
              <div className="grid grid--wide zone__cards">
                {connected.map((plugin) => {
                  const h = health[plugin.id];
                  const failed = h && !h.ok;
                  const Icon = PLUGIN_ICON[plugin.id] ?? Plug;
                  return (
                    <article key={plugin.id} data-plugin-id={plugin.id} ref={cardRef} aria-label={plugin.name} {...dragProps(plugin)} className={`plugin plugin--on ${failed ? "plugin--failed" : ""} ${dragging === plugin.id ? "plugin--dragging" : ""}`}>
                      <div className="plugin__top">
                        <span className="plugin__icon" aria-hidden="true"><Icon size={16} /></span>
                        <strong className="plugin__name">{plugin.name}</strong>
                        <span className={`plugin__badge ${failed ? "plugin__badge--off" : "plugin__badge--on"}`}>
                          {failed ? "Test failed" : "Connected"}
                        </span>
                      </div>
                      <span className="plugin__category">{plugin.category}</span>
                      {h && <span role={failed ? "alert" : "status"} className={`plugin__status ${failed ? "plugin__status--failed" : ""}`}>{h.text}</span>}
                      {plugin.status && <span className={`plugin__status ${plugin.status.warning ? "plugin__status--failed" : ""}`}>{plugin.status.text}</span>}
                      {flash?.id === plugin.id && <span className={`plugin__flash ${flash.on ? "plugin__flash--on" : ""}`} role="status">{flash.text}</span>}
                      {plugin.id === "n8n" && <DeliveryLog />}
                      {plugin.id === "twilio" && <CallLog />}
                      <div className="plugin__actions">
                        <button type="button" className="btn btn--sm" onClick={() => openDrawer(plugin)}>Settings</button>
                        <button type="button" className="btn btn--sm" onClick={() => test(plugin)}>Test</button>
                        <button type="button" className="btn btn--sm" onClick={() => remove(plugin)}><Unplug size={12} aria-hidden="true" />Remove</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
      {drawer && (
        <PluginDrawer
          plugin={drawer}
          onClose={() => { setDrawer(null); void load(); }}
          onDone={(result) => { setHealth((current) => ({ ...current, [drawer.id]: result })); setFlash({ id: drawer.id, text: `${drawer.name} connected`, on: true }); setDrawer(null); void load(); }}
        />
      )}
    </section>
  );
}
