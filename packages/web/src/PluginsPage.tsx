import React, { useEffect, useState } from "react";

type Field = { key: string; label: string; secret: boolean; placeholder?: string; help?: string; value: string; saved?: boolean; options?: { value: string; label: string }[] };
type Plugin = {
  id: string; name: string; category: string; description: string; limits: string; enabled: boolean; fields: Field[];
  preview?: { title: string; text: string }[]; status?: { text: string; warning: boolean };
};
type Status = { kind: "ok" | "error" | "info"; text: string } | null;

type Delivery = { id: string; type: string; bookingId: string; status: "pending" | "delivered" | "dead"; attempts: number; lastError?: string; createdAt: string };
const STATUS_LABEL = { delivered: "Delivered", pending: "Retrying", dead: "Failed" } as const;

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
  const load = () => fetch("/api/plugins").then((r) => r.json()).then((body) => setPlugins(body.data.plugins)).catch(() => setError("Cannot load plugins."));
  useEffect(() => { void load(); }, []);

  const remove = async (plugin: Plugin) => {
    if (!window.confirm(`Disconnect ${plugin.name}? It stops working until you add it again. Saved keys are kept.`)) return;
    const problem = await save(plugin, {}, false);
    if (problem) setError(problem);
    void load();
  };
  const test = async (plugin: Plugin) => {
    setHealth((current) => ({ ...current, [plugin.id]: { ok: true, text: "Testing…" } }));
    const result = await runTest(plugin);
    setHealth((current) => ({ ...current, [plugin.id]: result }));
  };
  const drop = (zone: "available" | "system") => (event: React.DragEvent) => {
    event.preventDefault();
    setOver(null);
    const plugin = plugins?.find((p) => p.id === event.dataTransfer.getData("text/plain"));
    if (!plugin) return;
    if (zone === "system" && !plugin.enabled) setDrawer(plugin);
    if (zone === "available" && plugin.enabled) void remove(plugin);
  };
  const zoneProps = (zone: "available" | "system") => ({
    onDragOver: (event: React.DragEvent) => { event.preventDefault(); setOver(zone); },
    onDragLeave: () => setOver(null),
    onDrop: drop(zone),
    className: `zone ${over === zone ? "zone--over" : ""}`
  });
  const dragProps = (plugin: Plugin) => ({ draggable: true, onDragStart: (event: React.DragEvent) => event.dataTransfer.setData("text/plain", plugin.id) });

  const available = plugins?.filter((p) => !p.enabled) ?? [];
  const connected = plugins?.filter((p) => p.enabled) ?? [];
  return (
    <section className="page" aria-labelledby="plugins-title">
      <div className="page__head">
        <div>
          <h1 className="page__title" id="plugins-title">Plugins</h1>
          <p className="page__lede">
            Drag a plugin into "My system" (or press Add) to connect it. Keys are encrypted on this server and never shown again.
          </p>
        </div>
      </div>
      {error && <p role="alert" className="field__error">{error}</p>}
      {!plugins && !error && <p className="page__lede">Loading plugins…</p>}
      {plugins && (
        <div className="zones">
          <div aria-labelledby="available-title" role="region" {...zoneProps("available")}>
            <h2 className="zone__title" id="available-title">Available ({available.length})</h2>
            {available.length === 0 && <p className="zone__hint">Everything is connected.</p>}
            {available.map((plugin) => (
              <article key={plugin.id} aria-label={plugin.name} {...dragProps(plugin)} className="plugin">
                <span className="plugin__category">{plugin.category}</span>
                <strong className="plugin__name">{plugin.name}</strong>
                <span className="plugin__desc">{plugin.description}</span>
                <div className="plugin__actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setDrawer(plugin)}>Add</button>
                </div>
              </article>
            ))}
          </div>
          <div aria-labelledby="system-title" role="region" {...zoneProps("system")}>
            <h2 className="zone__title" id="system-title">My system ({connected.length})</h2>
            {connected.length === 0 && <p className="zone__hint">Nothing connected yet. Drag a plugin here.</p>}
            {connected.map((plugin) => {
              const h = health[plugin.id];
              const failed = h && !h.ok;
              return (
                <article key={plugin.id} aria-label={plugin.name} {...dragProps(plugin)} className={`plugin ${failed ? "plugin--failed" : ""}`}>
                  <div className="plugin__head">
                    <strong className="plugin__name">{plugin.name}</strong>
                    <span className={`plugin__badge ${failed ? "plugin__badge--off" : "plugin__badge--on"}`}>
                      {failed ? "Test failed" : "Connected"}
                    </span>
                  </div>
                  {h && <span role={failed ? "alert" : "status"} className={`plugin__status ${failed ? "plugin__status--failed" : ""}`}>{h.text}</span>}
                  {plugin.status && <span className={`plugin__status ${plugin.status.warning ? "plugin__status--failed" : ""}`}>{plugin.status.text}</span>}
                  {plugin.id === "n8n" && <DeliveryLog />}
                  {plugin.id === "twilio" && <CallLog />}
                  <div className="plugin__actions">
                    <button type="button" className="btn btn--sm" onClick={() => setDrawer(plugin)}>Settings</button>
                    <button type="button" className="btn btn--sm" onClick={() => test(plugin)}>Test</button>
                    <button type="button" className="btn btn--sm" onClick={() => remove(plugin)}>Remove</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
      {drawer && (
        <PluginDrawer
          plugin={drawer}
          onClose={() => { setDrawer(null); void load(); }}
          onDone={(result) => { setHealth((current) => ({ ...current, [drawer.id]: result })); setDrawer(null); void load(); }}
        />
      )}
    </section>
  );
}
