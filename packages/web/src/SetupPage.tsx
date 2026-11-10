import React, { useState } from "react";

type Props = { onDone: () => void };

const field: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" };
const input: React.CSSProperties = {
  padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text-primary)", fontSize: 15
};

// First-run screen: the owner proves access to the server log (setup code) and picks a PIN.
export function SetupPage({ onDone }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6,8}$/.test(pin)) return setError("PIN must be 6 to 8 numbers.");
    if (pin !== pinAgain) return setError("The two PINs do not match.");
    setSaving(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, pin })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = body?.error?.code;
        setError(reason === "INVALID_SETUP_CODE" ? "Setup code is wrong. Copy it from the server log."
          : reason === "SETUP_LOCKED" ? "Setup is already done. Ask the owner to log in."
          : body?.error?.message || "Could not create the owner account. Try again.");
        return;
      }
      setDone(true);
      setTimeout(onDone, 1200);
    } catch {
      setError("Cannot reach the DispatchAI server. Is it running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "var(--bg, var(--surface))" }}>
      <form onSubmit={submit} aria-labelledby="setup-title" style={{
        width: "100%", maxWidth: 420, display: "grid", gap: 16, padding: 28, borderRadius: 12,
        border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 8px 30px rgba(0,0,0,0.06)"
      }}>
        <div>
          <h1 id="setup-title" style={{ margin: 0, fontSize: 22 }}>Set up DispatchAI</h1>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            Create the owner account. You only do this once on this computer or server.
          </p>
        </div>

        {done ? (
          <p role="status" style={{ margin: 0, padding: 12, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 }}>
            Owner account created. Opening the dashboard…
          </p>
        ) : (
          <>
            <label style={field}>
              Setup code
              <input aria-label="Setup code" style={input} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="off" placeholder="ABCD-EFGH" aria-describedby="code-help" />
              <span id="code-help" style={{ fontWeight: 400, fontSize: 12, color: "var(--text-tertiary)" }}>
                Shown in the server log when DispatchAI starts (Docker: <code>docker compose logs app</code>).
              </span>
            </label>
            <label style={field}>
              Your name
              <input aria-label="Your name" style={input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
            </label>
            <label style={field}>
              PIN (6–8 numbers)
              <input aria-label="PIN" style={input} type="password" inputMode="numeric" pattern="\d{6,8}" value={pin} onChange={(e) => setPin(e.target.value)} required autoComplete="new-password" />
            </label>
            <label style={field}>
              Repeat PIN
              <input aria-label="Repeat PIN" style={input} type="password" inputMode="numeric" value={pinAgain} onChange={(e) => setPinAgain(e.target.value)} required autoComplete="new-password" />
            </label>
            {error && <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
            <button type="submit" disabled={saving} style={{
              padding: "11px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent)",
              background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: saving ? "wait" : "pointer"
            }}>
              {saving ? "Creating…" : "Create owner account"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
