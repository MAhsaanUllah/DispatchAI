import { useState, type FormEvent } from "react";
import { ArrowRight, X } from "lucide-react";

export type DemoVisitor = { name: string; persona: "south_hvac" | "central_plumbing" | "north_hvac" };

export function DemoEntryForm({ onCancel, onContinue }: { onCancel: () => void; onContinue: (visitor: DemoVisitor) => Promise<void> }) {
  const [name, setName] = useState("");
  const [persona, setPersona] = useState<DemoVisitor["persona"]>("south_hvac");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError("Please enter your name."); return; }
    setBusy(true);
    try { await onContinue({ name: name.trim().slice(0, 80), persona }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not continue"); setBusy(false); }
  };
  return <div className="modal" role="dialog" aria-modal="true" aria-label="Try live voice demo">
    <div className="modal__panel">
      <div className="modal__head">
        <span className="public__card-label">Private recruiter demo</span>
        <button type="button" className="modal__close" onClick={onCancel} aria-label="Close"><X size={16} aria-hidden="true" /></button>
      </div>
      <div>
        <h2 className="modal__title">Talk to the dispatcher now.</h2>
        <p className="modal__lede">Choose a synthetic Austin service location. Google signs you into the private demo; no real customer data is used.</p>
      </div>
      <form className="modal__form" onSubmit={submit}>
        <label className="field" htmlFor="demoName">
          <span className="field__label">Your name</span>
          <input id="demoName" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ahsaan" autoComplete="name" maxLength={80} />
        </label>
        <label className="field" htmlFor="demoLocation">
          <span className="field__label">Demo service location</span>
          <select id="demoLocation" className="select" value={persona} onChange={(event) => setPersona(event.target.value as DemoVisitor["persona"])}>
            <option value="south_hvac">South Austin, HVAC</option>
            <option value="central_plumbing">Central Austin, Plumbing</option>
            <option value="north_hvac">North Austin, HVAC</option>
          </select>
        </label>
        {error && <p className="field__error" role="alert">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={busy}>Continue with Google</button>
      </form>
      <p className="field__hint">A private recruiter link is required. Booking only happens after your spoken confirmation.</p>
    </div>
  </div>;
}
