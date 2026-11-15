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

function PluginCard({ plugin, onChanged }: { plugin: Plugin; onChanged: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(plugin.fields.map((f) => [f.key, f.value])));
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const put = async (enabled: boolean) => {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/plugins/${plugin.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values, enabled }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setStatus({ kind: "error", text: body?.error?.message || "Could not save." });
      setStatus({ kind: "info", text: enabled ? "Saved and connected." : "Disconnected." });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setStatus({ kind: "info", text: "Testing…" });
    try {
      const body = await fetch(`/api/plugins/${plugin.id}/test`, { method: "POST" }).then((r) => r.json());
      setStatus({ kind: body?.data?.ok ? "ok" : "error", text: body?.data?.message ?? "Test failed." });
    } catch {
      setStatus({ kind: "error", text: "Cannot reach the DispatchAI server." });
    } finally {
      setBusy(false);
    }
  };

  const color = status?.kind === "ok" ? "var(--success, #15803d)" : status?.kind === "error" ? "var(--danger)" : "var(--text-secondary)";
  return (
    <article aria-labelledby={`plugin-${plugin.id}`} style={{ display: "grid", gap: 12, padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{plugin.category}</span>
          <h2 id={`plugin-${plugin.id}`} style={{ margin: "2px 0 0", fontSize: 17 }}>{plugin.name}</h2>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: plugin.enabled ? "var(--accent-soft)" : "var(--surface-subtle, #f5f5f4)", color: plugin.enabled ? "var(--accent)" : "var(--text-secondary)" }}>
          {plugin.enabled ? "Connected" : "Not connected"}
        </span>
      </header>
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
      {plugin.status && (
        <p role={plugin.status.warning ? "alert" : "status"} style={{ margin: 0, fontSize: 13, padding: plugin.status.warning ? 8 : 0, borderRadius: 8, background: plugin.status.warning ? "var(--danger-soft)" : "none", color: plugin.status.warning ? "var(--danger)" : "var(--text-secondary)" }}>
          {plugin.status.text}
        </p>
      )}
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
      {plugin.id === "n8n" && plugin.enabled && <DeliveryLog />}
      {plugin.id === "twilio" && plugin.enabled && <CallLog />}
      <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)" }}>Limits: {plugin.limits}</p>
      {status && <p role={status.kind === "error" ? "alert" : "status"} style={{ margin: 0, fontSize: 13, color }}>{status.text}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={busy} onClick={() => put(true)} style={button(true)}>{plugin.enabled ? "Save" : "Connect"}</button>
        <button type="button" disabled={busy} onClick={test} style={button()}>Test</button>
        {plugin.enabled && <button type="button" disabled={busy} onClick={() => put(false)} style={button()}>Disconnect</button>}
      </div>
    </article>
  );
}

// Built-in plugins. Only working plugins are listed (no "coming soon").
export function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[] | null>(null);
  const [error, setError] = useState("");
  const load = () => fetch("/api/plugins").then((r) => r.json()).then((body) => setPlugins(body.data.plugins)).catch(() => setError("Cannot load plugins."));
  useEffect(() => { void load(); }, []);

  return (
    <section aria-labelledby="plugins-title" style={{ display: "grid", gap: 16, maxWidth: 760 }}>
      <div>
        <h1 id="plugins-title" style={{ margin: 0, fontSize: 22 }}>Plugins</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>Connect outside services. Keys are encrypted on this server and never shown again.</p>
      </div>
      {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
      {!plugins && !error && <p>Loading plugins…</p>}
      {plugins?.map((plugin) => <PluginCard key={`${plugin.id}-${plugin.enabled}`} plugin={plugin} onChanged={load} />)}
    </section>
  );
}
