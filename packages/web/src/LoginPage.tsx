import React, { useState } from "react";

type Props = { onDone: () => void };

// Owner PIN login. The server sets an HttpOnly session cookie; nothing is stored in the browser by this page.
export function LoginPage({ onDone }: Props) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin })
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) return onDone();
      setPin("");
      setError(body?.error?.code === "WRONG_PIN" ? "PIN is wrong. After 5 wrong tries, login locks for 15 minutes."
        : body?.error?.message || "Could not log in. Try again.");
    } catch {
      setError("Cannot reach the DispatchAI server. Is it running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ height: "100%", overflowY: "auto", boxSizing: "border-box", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} aria-labelledby="login-title" style={{
        width: "100%", maxWidth: 360, display: "grid", gap: 16, padding: 28, borderRadius: 12,
        border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 8px 30px rgba(0,0,0,0.06)"
      }}>
        <div>
          <h1 id="login-title" style={{ margin: 0, fontSize: 22 }}>Log in to DispatchAI</h1>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>Enter your name and PIN.</p>
        </div>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          Your name
          <input
            aria-label="Your name" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
            style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", fontSize: 15 }}
          />
          <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-tertiary)" }}>Owner can leave this empty.</span>
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
          PIN
          <input
            aria-label="PIN" type="password" inputMode="numeric" autoComplete="current-password" autoFocus required
            value={pin} onChange={(e) => setPin(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", fontSize: 18, letterSpacing: 4 }}
          />
        </label>
        {error && <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={busy || pin.length === 0} style={{
          padding: "11px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent)",
          background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: busy ? "wait" : "pointer"
        }}>
          {busy ? "Checking…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
