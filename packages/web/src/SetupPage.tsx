import React, { useState } from "react";

type Props = { onDone: () => void };

// First-run screen: the owner proves access to the server log (setup code) and picks a PIN.
export function SetupPage({ onDone }: Props) {
  // The desktop app opens /app#setup=<code> so the owner does not have to copy the code.
  const [code, setCode] = useState(() => /setup=([\w-]+)/.exec(window.location.hash)?.[1] ?? "");
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
        return setError(reason === "INVALID_SETUP_CODE" ? "Setup code is wrong. Copy it from the server log."
          : reason === "SETUP_LOCKED" ? "Setup is already done. Ask the owner to log in."
          : body?.error?.message || "Could not create the owner account. Try again.");
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
    <main className="auth">
      <form onSubmit={submit} aria-labelledby="setup-title" className="auth__panel">
        <div>
          <h1 id="setup-title" className="auth__title">Set up DispatchAI</h1>
          <p className="auth__lede">Create the owner account. You only do this once on this computer or server.</p>
        </div>

        {done ? (
          <p role="status" className="auth__status">Owner account created. Now log in with your PIN…</p>
        ) : (
          <div className="auth__form">
            <label className="field">
              <span className="field__label">Setup code</span>
              <input className="input" aria-label="Setup code" value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="off" placeholder="ABCD-EFGH" aria-describedby="code-help" />
              <span id="code-help" className="field__hint">
                Shown in the server log when DispatchAI starts (Docker: <code>docker compose logs app</code>).
              </span>
            </label>
            <label className="field">
              <span className="field__label">Your name</span>
              <input className="input" aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
            </label>
            <label className="field">
              <span className="field__label">PIN (6 to 8 numbers)</span>
              <input className="input" aria-label="PIN" type="password" inputMode="numeric" pattern="\d{6,8}" value={pin} onChange={(e) => setPin(e.target.value)} required autoComplete="new-password" />
            </label>
            <label className="field">
              <span className="field__label">Repeat PIN</span>
              <input className="input" aria-label="Repeat PIN" type="password" inputMode="numeric" value={pinAgain} onChange={(e) => setPinAgain(e.target.value)} required autoComplete="new-password" />
            </label>
            {error && <p role="alert" className="auth__error">{error}</p>}
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? "Creating…" : "Create owner account"}
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
