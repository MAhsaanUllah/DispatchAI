import React, { useEffect, useState } from "react";

type Field = { key: string; label: string; secret: boolean; placeholder?: string; help?: string; value: string; saved?: boolean };
type Plugin = { id: string; name: string; category: string; description: string; limits: string; enabled: boolean; fields: Field[] };
type Status = { kind: "ok" | "error" | "info"; text: string } | null;

const input: React.CSSProperties = { padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 14 };
const button = (primary = false): React.CSSProperties => ({
  ...input, cursor: "pointer", fontWeight: 600, ...(primary ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" } : {})
});

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
          <input
            aria-label={field.label} style={input} type={field.secret ? "password" : "text"} autoComplete="off"
            placeholder={field.secret && field.saved ? "Saved — leave empty to keep" : field.placeholder}
            value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
          />
          {field.help && <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-tertiary)" }}>{field.help}</span>}
        </label>
      ))}
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
