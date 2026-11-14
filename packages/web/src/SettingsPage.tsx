import React, { useEffect, useState } from "react";
import { BackupPanel } from "./components/BackupPanel.js";

type Note = { error: boolean; text: string } | null;

const send = async (url: string, method: string, body: unknown): Promise<NonNullable<Note>> => {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return { error: false, text: "Done." };
  const data = await response.json().catch(() => ({}));
  return { error: true, text: data?.error?.message || "That did not work. Try again." };
};

// Owner only: your PIN, your logins, a backup, and the ways to start over. The server asks for the PIN again before anything is erased.
export function SettingsPage({ onOpenTeam }: { onOpenTeam: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pinNote, setPinNote] = useState<Note>(null);
  const [erasePin, setErasePin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [eraseNote, setEraseNote] = useState<Note>(null);

  const [zone, setZone] = useState("");
  const [zoneNote, setZoneNote] = useState<Note>(null);
  const zones = (() => { try { return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { return []; } })();
  const thisComputer = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
  useEffect(() => { fetch("/api/business").then((r) => r.json()).then((b) => setZone(b?.data?.config?.timeZone ?? "")).catch(() => undefined); }, []);
  const saveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = await send("/api/business", "PUT", { timeZone: zone.trim() });
    if (!note.error) return window.location.reload();
    setZoneNote(note.text.startsWith("timeZone") ? { error: true, text: "Time zone not recognised. Pick one from the list, for example Asia/Karachi." } : note);
  };
  const changePin = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = await send("/api/users/owner/pin", "PUT", { current: current.trim(), pin: next.trim() });
    setPinNote(note.error ? note : { error: false, text: "New PIN saved. Use it next time you log in." });
    if (!note.error) { setCurrent(""); setNext(""); }
  };
  const erase = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = await send("/api/erase-data", "POST", { pin: erasePin.trim(), confirm: confirm === "ERASE" ? "ERASE_ALL_DATA" : "" });
    if (!note.error) return window.location.reload();
    setEraseNote(note);
  };

  return (
    <div className="app-body">
      <section className="record" aria-labelledby="set-pin">
        <h2 className="record__name" id="set-pin">Your PIN</h2>
        <p className="page__lede">Pick a PIN only you know (6 to 8 numbers). Forgot it? Whoever runs the server can reset it (README, "Forgot your PIN").</p>
        <form onSubmit={changePin} className="login-form">
          <label className="field"><span className="field__label">Current PIN</span>
            <input className="input" type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
          <label className="field"><span className="field__label">New PIN</span>
            <input className="input" type="password" inputMode="numeric" pattern="\d{6,8}" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></label>
          <button type="submit" className="btn btn--primary">Change PIN</button>
        </form>
        {pinNote && <p role={pinNote.error ? "alert" : "status"} className={pinNote.error ? "field__error" : "field__hint"}>{pinNote.text}</p>}
      </section>

      <section className="record" aria-labelledby="set-zone">
        <h2 className="record__name" id="set-zone">Time zone</h2>
        <p className="page__lede">Opening hours, free slots and the clock use this zone. Changing it moves open slots to the new local time.</p>
        <form onSubmit={saveZone} className="login-form">
          <label className="field"><span className="field__label">Time zone</span>
            <input className="input" aria-label="Time zone" list="settings-zones" value={zone} onChange={(e) => setZone(e.target.value)} required placeholder="Asia/Karachi" />
            <datalist id="settings-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist></label>
          {thisComputer && thisComputer !== zone && <button type="button" className="btn" onClick={() => setZone(thisComputer)}>Use this computer's ({thisComputer})</button>}
          <button type="submit" className="btn btn--primary">Save time zone</button>
        </form>
        {zoneNote && <p role="alert" className="field__error">{zoneNote.text}</p>}
      </section>

      <section className="record" aria-labelledby="set-logins">
        <h2 className="record__name" id="set-logins">Logins</h2>
        <p className="page__lede">Add staff, remove them, or give someone a new PIN.</p>
        <button type="button" className="btn" onClick={onOpenTeam}>Open Team logins</button>
      </section>

      <section className="record" aria-labelledby="set-backup">
        <h2 className="record__name" id="set-backup">Backup</h2>
        <BackupPanel />
      </section>

      <section className="record" aria-labelledby="set-erase">
        <h2 className="record__name" id="set-erase">Start over</h2>
        <p className="page__lede">Erases all bookings, customers and technician schedules on this install. Logins, saved keys and your business details stay. Download a backup first: this cannot be undone.</p>
        <form onSubmit={erase} className="login-form">
          <label className="field"><span className="field__label">Your PIN</span>
            <input className="input" type="password" inputMode="numeric" autoComplete="off" value={erasePin} onChange={(e) => setErasePin(e.target.value)} required /></label>
          <label className="field"><span className="field__label">Type ERASE to confirm</span>
            <input className="input" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>
          <button type="submit" className="btn" disabled={confirm !== "ERASE"}>Erase all data</button>
        </form>
        {eraseNote && <p role="alert" className="field__error">{eraseNote.text}</p>}
        <p className="field__hint">To remove everything, logins and keys included, so the app asks for first-time setup again: stop it, then delete its data (Docker: <code>docker compose down -v</code>; desktop: uninstall and delete the app's data folder). Back up first.</p>
      </section>

      <section className="record" aria-labelledby="set-privacy">
        <h2 className="record__name" id="set-privacy">Privacy</h2>
        <p className="page__lede">DispatchAI collects nothing. Your data stays on this computer or server. It leaves only for features you turn on: a cloud AI provider, email (Resend), phone (Twilio), your n8n, the Cloudflare public address, an MCP assistant, and your browser's speech service for the Test call microphone.</p>
      </section>
    </div>
  );
}
