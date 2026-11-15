import React, { useEffect, useState } from "react";

type StaffLogin = { id: string; name: string; createdAt: string };

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
    <section aria-labelledby="logins-title" className="record">
      <div>
        <h2 className="record__name" id="logins-title">Dashboard logins</h2>
        <p className="page__lede">Staff can see bookings and the inbox. Only you can change settings, plugins and logins.</p>
      </div>
      <ul className="record__list plain-list">
        {data?.owner && <li className="record__row"><dt>Owner</dt><dd>{data.owner}</dd></li>}
        {data?.staff.map((login) => (
          <li key={login.id} className="record__row">
            <dt>Staff</dt>
            <dd>
              {login.name}
              <button type="button" onClick={() => remove(login)} className="btn btn--sm" aria-label={`Remove ${login.name}`}>Remove</button>
            </dd>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="login-form">
        <label className="field">
          <span className="field__label">Name</span>
          <input className="input" aria-label="Staff name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>
        <label className="field">
          <span className="field__label">Starting PIN (6 to 8 numbers)</span>
          <input className="input" aria-label="Starting PIN" type="password" inputMode="numeric" pattern="\d{6,8}" value={pin} onChange={(e) => setPin(e.target.value)} required autoComplete="new-password" />
        </label>
        <button type="submit" className="btn btn--primary">Add login</button>
      </form>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "field__error" : "field__hint"}>{message.text}</p>}
    </section>
  );
}
