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
    <main className="auth">
      <form onSubmit={submit} aria-labelledby="login-title" className="auth__panel">
        <div>
          <h1 id="login-title" className="auth__title">Log in to DispatchAI</h1>
          <p className="auth__lede">Enter your name and PIN.</p>
        </div>
        <div className="auth__form">
          <label className="field">
            <span className="field__label">Your name</span>
            <input className="input" aria-label="Your name" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <span className="field__hint">Owner can leave this empty.</span>
          </label>
          <label className="field">
            <span className="field__label">PIN</span>
            <input className="input input--pin" aria-label="PIN" type="password" inputMode="numeric" autoComplete="current-password" autoFocus required
              value={pin} onChange={(e) => setPin(e.target.value)} />
          </label>
          {error && <p role="alert" className="auth__error">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={busy || pin.length === 0}>
            {busy ? "Checking…" : "Log in"}
          </button>
        </div>
      </form>
    </main>
  );
}
