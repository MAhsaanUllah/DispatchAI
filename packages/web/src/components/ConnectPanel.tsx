import React, { useEffect, useRef, useState } from "react";
import { Bot, Code, KeyRound } from "lucide-react";
import type { ConnectionInfo } from "../features.js";

export type KeyRow = { id: string; name: string; scope: "read" | "write"; last4: string; createdAt: string; lastUsedAt?: string; revokedAt?: string };
export type ConnectMode = "api" | "mcp";

export const activeKeys = (keys: readonly KeyRow[]) => keys.filter((key) => !key.revokedAt);

// The address an outside program should use: the tunnel's when it is online (its status reads "Online at https://..."),
// otherwise the address of this page.
export const tunnelAddress = (statusText?: string) => /https:\/\/[^\s]+/.exec(statusText ?? "")?.[0]?.replace(/[.,]+$/, "");
export const isLocalOnly = (address: string) => /^https?:\/\/(localhost|127\.|\[::1\])/i.test(address);
export const curlExample = (base: string) => `curl -H "Authorization: Bearer YOUR_KEY" ${base}/api/v1/bookings`;

const SCOPES: { id: KeyRow["scope"]; title: string; text: string }[] = [
  { id: "read", title: "Look things up only", text: "Can see bookings and free times." },
  { id: "write", title: "Look up and change bookings", text: "Can also book, move and cancel." }
];
const scopeTitle = (scope: KeyRow["scope"]) => SCOPES.find((item) => item.id === scope)?.title ?? scope;
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "never");

const API_CALLS = [
  "GET /api/v1/bookings (look up)",
  "GET /api/v1/free-times?serviceType=...&serviceZone=...&date=YYYY-MM-DD (look up)",
  "POST /api/v1/customers/find (look up)",
  "POST /api/v1/customers (change)",
  "POST /api/v1/bookings (change)",
  "POST /api/v1/bookings/{id}/reschedule and /cancel (change)"
];

const ICON = { api: Code, mcp: Bot } as const;

// One card per connection kind on the Features page. They have no on/off switch: they are live while a key exists.
export function ConnectionCard({ info, count, onOpen, delay }: { info: ConnectionInfo; count: number; onOpen: () => void; delay: number }) {
  const Icon = ICON[info.id] ?? KeyRound;
  const state = count > 0 ? "live" : "off";
  return (
    <article aria-label={info.name} style={{ animationDelay: `${delay}ms` }} className={`feature feature--${state}`}>
      <div className="feature__top">
        <span className="feature__icon" aria-hidden="true"><Icon size={16} /></span>
        <h3 className="feature__name">{info.name}</h3>
        <span className={`state state--${state}`}>{state === "live" ? "Live" : "Off"}</span>
      </div>
      <p className="feature__kind">{info.kind}</p>
      <p className="feature__benefit">{info.benefit}</p>
      <details className="feature__more">
        <summary>What changes when this is on</summary>
        <p>{info.changes}</p>
      </details>
      <p className="feature__status">{count === 0 ? "No keys yet." : `${count} active key${count === 1 ? "" : "s"}.`}</p>
      <div className="feature__actions">
        <button type="button" className={count === 0 ? "btn btn--primary btn--sm" : "btn btn--sm"} onClick={onOpen}>{count === 0 ? "Create a key" : "Manage keys"}</button>
      </div>
    </article>
  );
}

// Shown once, right after a key is created. Only a hash is kept on the server, so this is the only time the key is readable.
export function NewKeyBox({ keyText, onCopy, copied }: { keyText: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="keybox" role="status">
      <p className="keybox__warn">Copy this key now. We cannot show it again.</p>
      <code className="keybox__key">{keyText}</code>
      <button type="button" className="btn btn--sm" onClick={onCopy}>{copied ? "Copied" : "Copy key"}</button>
    </div>
  );
}

type Props = { mode: ConnectMode; address: string; tunnelOn: boolean; onClose: () => void; onChanged: () => void };

// Create, list and revoke keys. The Developer API and the AI assistant (MCP) use the same keys; only the instructions differ.
export function KeysDrawer({ mode, address, tunnelOn, onClose, onChanged }: Props) {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<KeyRow["scope"]>("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const load = () => fetch("/api/api-keys").then((r) => r.json()).then((body) => setKeys(body.data.keys)).catch(() => { setKeys([]); setError("Could not read the keys."); });
  useEffect(() => {
    void load();
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setCopied(false);
    setBusy(true);
    try {
      const response = await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scope }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setError(body?.error?.message ?? "Could not create the key.");
      setCreated(body.data.key);
      setName("");
      await load();
      onChanged();
    } catch {
      setError("Cannot reach the DispatchAI server.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: KeyRow) => {
    if (!window.confirm(`Revoke "${row.name}"? Anything using it stops working at once.`)) return;
    const response = await fetch(`/api/api-keys/${row.id}`, { method: "DELETE" });
    if (!response.ok) return setError("Could not revoke the key.");
    setCreated(null);
    await load();
    onChanged();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(created ?? ""); setCopied(true); } catch { setError("Copy did not work here. Select the key and copy it by hand."); }
  };

  const title = mode === "api" ? "Developer API" : "Connect an assistant (MCP)";
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="connect-title">
      <div className="drawer drawer--wide" ref={panel} tabIndex={-1}>
        <div className="drawer__head">
          <h2 className="drawer__id" id="connect-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="modal__close">×</button>
        </div>
        <div className="drawer__body">
          <p className="drawer__text">
            {mode === "api"
              ? "Let your own software, or a developer you hire, read bookings and create them for this business. Keys work only for this business."
              : "Ask your own AI assistant about your bookings, or have it book for you. Your assistant sees names and addresses, so connect only assistants you trust. A change it proposes is applied only after you clearly say yes."}
          </p>

          <form onSubmit={create} className="wizard__body">
            <label className="field">
              <span className="field__label">What is this key for?</span>
              <input className="input" aria-label="Key name" value={name} maxLength={60} required placeholder={mode === "api" ? "For example Website form" : "For example My assistant"} onChange={(e) => setName(e.target.value)} />
            </label>
            <fieldset className="scope">
              <legend className="field__label">Access</legend>
              {SCOPES.map((option) => (
                <label key={option.id} className="scope__option">
                  <input type="radio" name="key-scope" checked={scope === option.id} onChange={() => setScope(option.id)} />
                  <span><strong>{option.title}</strong> <span className="field__hint">{option.text}</span></span>
                </label>
              ))}
            </fieldset>
            <div><button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "Creating…" : "Create key"}</button></div>
          </form>

          {created && <NewKeyBox keyText={created} onCopy={copy} copied={copied} />}
          {error && <p role="alert" className="field__error">{error}</p>}

          <section aria-labelledby="keys-title" className="keylist">
            <h3 className="keylist__title" id="keys-title">Your keys</h3>
            {keys === null && <p className="field__hint">Reading keys…</p>}
            {keys && keys.length === 0 && <p className="field__hint">No keys yet. Create one when a developer or an assistant needs it.</p>}
            {keys && keys.length > 0 && (
              <ul className="keylist__rows">
                {keys.map((row) => (
                  <li key={row.id} className={row.revokedAt ? "keylist__row keylist__row--revoked" : "keylist__row"}>
                    <span className="keylist__name">{row.name}</span>
                    <span className="keylist__meta">{scopeTitle(row.scope)}. Ends with {row.last4}. Created {day(row.createdAt)}. Last used {day(row.lastUsedAt)}.</span>
                    {row.revokedAt
                      ? <span className="keylist__state">Revoked {day(row.revokedAt)}</span>
                      : <button type="button" className="btn btn--sm" aria-label={`Revoke ${row.name}`} onClick={() => revoke(row)}>Revoke</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {mode === "api" ? (
            <section aria-labelledby="how-title" className="howto">
              <h3 className="keylist__title" id="how-title">How to call it</h3>
              <pre className="backup__code" tabIndex={0} aria-label="Example request"><code>{curlExample(address)}</code></pre>
              <ul className="howto__list">{API_CALLS.map((call) => <li key={call}><code>{call}</code></li>)}</ul>
              <p className="field__hint">A look-up key that tries to change something is refused, and one task is added to your Inbox.</p>
            </section>
          ) : (
            <section aria-labelledby="how-title" className="howto">
              <h3 className="keylist__title" id="how-title">Connect your assistant</h3>
              <ol className="howto__steps">
                <li>Create a key above. Look things up only is the safe choice to start with.</li>
                <li>In your assistant's settings add an MCP server at <code>{address}/api/mcp</code> and send the key as a Bearer token.</li>
                <li>Ask it: "What is on tomorrow?" Changes are proposed first; say yes only when you mean it.</li>
              </ol>
              {tunnelOn
                ? <p className="field__hint">This address is reachable from the internet through your Public address.</p>
                : isLocalOnly(address)
                  ? <p className="field__hint">This address works only on this computer. To reach it from outside, switch on Public address on this page, or run DispatchAI on a cloud server.</p>
                  : null}
            </section>
          )}
          <div className="gate__actions"><button type="button" className="btn" onClick={onClose}>Done</button></div>
        </div>
      </div>
    </div>
  );
}
