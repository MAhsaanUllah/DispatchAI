import React, { useEffect, useState } from "react";

type Field = { key: string; label: string; secret: boolean; placeholder?: string; help?: string; value: string; saved?: boolean; options?: { value: string; label: string }[] };
type Plugin = {
  id: string; name: string; category: string; description: string; limits: string; enabled: boolean; fields: Field[];
  preview?: { title: string; text: string }[]; status?: { text: string; warning: boolean };
};
type Status = { kind: "ok" | "error" | "info"; text: string } | null;

const input: React.CSSProperties = { padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 14 };
const button = (primary = false): React.CSSProperties => ({
  ...input, cursor: "pointer", fontWeight: 600, ...(primary ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" } : {})
});

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
    <details style={{ fontSize: 13 }} open={rows.some((row) => row.status !== "delivered")}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Recent deliveries ({rows.length})</summary>
      {rows.length === 0 ? <p style={{ color: "var(--text-tertiary)" }}>No events sent yet. They appear here after the next booking.</p> : (
        <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}><th>When</th><th>Event</th><th>Booking</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.type}</td>
                <td>{row.bookingId.replace(/^wo_/, "WO-")}</td>
                <td style={{ color: row.status === "dead" ? "var(--danger)" : undefined }}>
                  {STATUS_LABEL[row.status]}{row.status !== "delivered" && row.lastError ? ` (${row.lastError}, ${row.attempts} tries)` : ""}
                </td>
                <td>{row.status !== "delivered" && <button type="button" onClick={() => retry(row.id)} style={button()}>Retry</button>}</td>
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
    <details style={{ fontSize: 13 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Recent calls ({calls.length})</summary>
      {calls.length === 0 ? <p style={{ color: "var(--text-tertiary)" }}>No calls yet since the server started.</p> : (
        <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}><th>When</th><th>From</th><th>Turns</th><th>Outcome</th></tr></thead>
          <tbody>{calls.map((call) => (
            <tr key={call.id} style={{ borderTop: "1px solid var(--border)" }}>
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
    <div role="dialog" aria-modal="true" aria-labelledby={`drawer-${plugin.id}`} style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end", background: "rgba(0,0,0,0.25)" }}>
      <div style={{ width: "100%", maxWidth: 460, height: "100%", overflowY: "auto", boxSizing: "border-box", display: "grid", alignContent: "start", gap: 12, padding: 20, background: "var(--surface)", borderLeft: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 id={`drawer-${plugin.id}`} style={{ margin: 0, fontSize: 18 }}>{plugin.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>{plugin.description}</p>
        {plugin.fields.map((field) => (
          <label key={field.key} style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 600 }}>
            {field.label}
            {field.options ? (
              <select aria-label={field.label} style={input} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}>
                <option value="">Choose…</option>
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input
                aria-label={field.label} style={input} type={field.secret ? "password" : "text"} autoComplete="off"
                placeholder={field.secret && field.saved ? "Saved — leave empty to keep" : field.placeholder}
                value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
              />
            )}
            {field.help && <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-tertiary)" }}>{field.help}</span>}
          </label>
        ))}
        {plugin.preview && (
          <details style={{ fontSize: 13 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Preview what customers receive</summary>
            {plugin.preview.map((sample) => (
              <div key={sample.title} style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "var(--surface-subtle, #f5f5f4)" }}>
                <strong style={{ display: "block" }}>{sample.title}</strong>
                <span style={{ color: "var(--text-secondary)" }}>{sample.text}</span>
              </div>
            ))}
          </details>
        )}
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)" }}>Limits: {plugin.limits}</p>
        {message && <p role={message.kind === "error" ? "alert" : "status"} style={{ margin: 0, fontSize: 13, color: message.kind === "error" ? "var(--danger)" : "var(--text-secondary)" }}>{message.text}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={busy} onClick={saveAndTest} style={button(true)}>{busy ? "Working…" : "Save & Test"}</button>
          <button type="button" disabled={busy} onClick={onClose} style={button()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { display: "grid", gap: 8, padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "grab" };

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
    style: {
      display: "grid", alignContent: "start", gap: 10, minHeight: 220, padding: 14, borderRadius: 12,
      border: `2px dashed ${over === zone ? "var(--accent)" : "var(--border)"}`, background: over === zone ? "var(--accent-soft)" : "transparent"
    } as React.CSSProperties
  });
  const dragProps = (plugin: Plugin) => ({ draggable: true, onDragStart: (event: React.DragEvent) => event.dataTransfer.setData("text/plain", plugin.id) });

  const available = plugins?.filter((p) => !p.enabled) ?? [];
  const connected = plugins?.filter((p) => p.enabled) ?? [];
  return (
    <section aria-labelledby="plugins-title" style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
      <div>
        <h1 id="plugins-title" style={{ margin: 0, fontSize: 22 }}>Plugins</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
          Drag a plugin into "My system" (or press Add) to connect it. Keys are encrypted on this server and never shown again.
        </p>
      </div>
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      {!plugins && !error && <p>Loading plugins…</p>}
      {plugins && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <div aria-labelledby="available-title" role="region" {...zoneProps("available")}>
            <h2 id="available-title" style={{ margin: 0, fontSize: 15 }}>Available ({available.length})</h2>
            {available.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>Everything is connected.</p>}
            {available.map((plugin) => (
              <article key={plugin.id} aria-label={plugin.name} {...dragProps(plugin)} style={cardStyle}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{plugin.category}</span>
                <strong>{plugin.name}</strong>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{plugin.description}</span>
                <button type="button" onClick={() => setDrawer(plugin)} style={{ ...button(true), justifySelf: "start" }}>Add</button>
              </article>
            ))}
          </div>
          <div aria-labelledby="system-title" role="region" {...zoneProps("system")}>
            <h2 id="system-title" style={{ margin: 0, fontSize: 15 }}>My system ({connected.length})</h2>
            {connected.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>Nothing connected yet. Drag a plugin here.</p>}
            {connected.map((plugin) => {
              const h = health[plugin.id];
              const failed = h && !h.ok;
              return (
                <article key={plugin.id} aria-label={plugin.name} {...dragProps(plugin)} style={{ ...cardStyle, borderColor: failed ? "var(--danger)" : "var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <strong>{plugin.name}</strong>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: failed ? "var(--danger-soft)" : "var(--accent-soft)", color: failed ? "var(--danger)" : "var(--accent)" }}>
                      {failed ? "Test failed" : "Connected"}
                    </span>
                  </div>
                  {h && <span role={failed ? "alert" : "status"} style={{ fontSize: 13, color: failed ? "var(--danger)" : "var(--text-secondary)" }}>{h.text}</span>}
                  {plugin.status && <span style={{ fontSize: 13, color: plugin.status.warning ? "var(--danger)" : "var(--text-secondary)" }}>{plugin.status.text}</span>}
                  {plugin.id === "n8n" && <DeliveryLog />}
                  {plugin.id === "twilio" && <CallLog />}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => setDrawer(plugin)} style={button()}>Settings</button>
                    <button type="button" onClick={() => test(plugin)} style={button()}>Test</button>
                    <button type="button" onClick={() => remove(plugin)} style={button()}>Remove</button>
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
