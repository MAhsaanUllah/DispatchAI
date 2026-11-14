import React, { useState } from "react";

type Props = { onDone: () => void };

// Owner PIN login. The server sets an HttpOnly session cookie; nothing is stored in the browser by this page.
export function LoginPage({ onDone }: Props) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

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
      // The server never says which half was wrong (that would reveal who has a login), so with a name typed we say both.
      setError(body?.error?.code === "WRONG_PIN" ? `${name.trim() ? "Name or PIN is wrong" : "PIN is wrong"}. After 5 wrong tries, login locks for 15 minutes.`
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
          <p className="auth__brand"><span className="app-nav__mark"><img src="/favicon.svg" alt="" width="18" height="18" /></span><span>Dispatch<span className="public__brand-accent">AI</span></span></p>
          <h1 id="login-title" className="auth__title">Log in</h1>
          <p className="auth__lede">Your name and PIN. Nothing is kept in this browser.</p>
        </div>
        <div className="auth__form">
          <label className="field">
            <span className="field__label">Your name</span>
            <input className="input" aria-label="Your name" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <span className="field__hint">Owner: leave this empty. Staff: the name the owner gave you.</span>
          </label>
          <label className="field">
            <span className="field__label">PIN</span>
            <input className="input input--pin" aria-label="PIN" type={show ? "text" : "password"} inputMode="numeric" autoComplete="off" autoFocus required
              value={pin} onChange={(e) => setPin(e.target.value.trim())} />
            <label className="field__hint"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show PIN</label>
          </label>
          {error && <p role="alert" className="auth__error">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={busy || pin.length === 0}>
            {busy ? "Checking…" : "Log in"}
          </button>
          <p className="field__hint">Forgot the PIN? Whoever runs this server resets it (README, "Forgot your PIN").</p>
        </div>
        <details className="auth__privacy">
          <summary>Privacy: what leaves this computer</summary>
          <p>The DispatchAI project collects nothing. No account, no tracking, no analytics. Your data stays on the computer or server where this app runs.</p>
          <p>It goes elsewhere only when you turn something on:</p>
          <ul>
            <li><strong>AI brain</strong>: with a cloud provider (OpenAI, Anthropic, Gemini, Grok, Groq, Workers AI) the caller's words go to that provider. With Ollama they stay here.</li>
            <li><strong>Email</strong>: booking mails go through Resend. <strong>Phone line</strong>: calls go through Twilio.</li>
            <li><strong>Custom workflow</strong>: your n8n gets booking events. <strong>Public address</strong>: traffic passes through Cloudflare.</li>
            <li><strong>Test call</strong> with the microphone: your browser's vendor turns speech into text.</li>
            <li><strong>AI assistant over MCP</strong>: what it reads goes to that assistant's provider.</li>
          </ul>
        </details>
      </form>
    </main>
  );
}
