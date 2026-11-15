import React, { useEffect, useState } from "react";

type StaffLogin = { id: string; name: string; createdAt: string };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 14 };

// Owner only: who can log in to this dashboard. Staff see bookings and the inbox; they cannot change settings or plugins.
export function TeamLogins() {
  const [data, setData] = useState<{ owner?: string; staff: StaffLogin[] } | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const load = () => fetch("/api/users").then((r) => r.json()).then((body) => setData(body.data)).catch(() => setData({ staff: [] }));
  useEffect(() => { void load(); }, []);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, pin }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage({ error: true, text: body?.error?.message ?? "Could not add the login." });
    setMessage({ error: false, text: `${name} can now log in with their name and the PIN you set. Tell them the PIN in person.` });
    setName("");
    setPin("");
    void load();
  };
  const remove = async (login: StaffLogin) => {
    if (!window.confirm(`Remove ${login.name}? They will be logged out everywhere.`)) return;
    await fetch(`/api/users/${login.id}`, { method: "DELETE" });
    void load();
  };

  return (
    <section aria-labelledby="logins-title" style={{ display: "grid", gap: 12, padding: 18, marginBottom: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", maxWidth: 760 }}>
      <div>
        <h2 id="logins-title" style={{ margin: 0, fontSize: 18 }}>Dashboard logins</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>Staff can see bookings and the inbox. Only you can change settings, plugins and logins.</p>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 14 }}>
        {data?.owner && <li><strong>{data.owner}</strong> · owner</li>}
        {data?.staff.map((login) => (
          <li key={login.id}>
            {login.name} · staff{" "}
            <button type="button" onClick={() => remove(login)} style={{ ...input, padding: "2px 8px", cursor: "pointer" }} aria-label={`Remove ${login.name}`}>Remove</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Name
          <input aria-label="Staff name" style={input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
          Starting PIN (6–8 numbers)
          <input aria-label="Starting PIN" style={input} type="password" inputMode="numeric" pattern="\d{6,8}" value={pin} onChange={(e) => setPin(e.target.value)} required autoComplete="new-password" />
        </label>
        <button type="submit" style={{ ...input, background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Add login</button>
      </form>
      {message && <p role={message.error ? "alert" : "status"} style={{ margin: 0, fontSize: 13, color: message.error ? "var(--danger)" : "var(--text-secondary)" }}>{message.text}</p>}
    </section>
  );
}
