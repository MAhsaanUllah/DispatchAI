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
  return <div className="voice-backdrop" role="dialog" aria-modal="true" aria-label="Try live voice demo">
    <div className="precall-panel">
      <div className="precall-head"><span className="precall-eyebrow">PRIVATE RECRUITER DEMO</span><button type="button" className="voice-close" onClick={onCancel} aria-label="Close"><X size={18} /></button></div>
      <div className="precall-intro"><img src="/dispatch-agent-avatar.png" alt="" width="56" height="56" /><div><strong>Talk to the dispatcher now.</strong><p>Choose a synthetic Austin service location. Google signs you into the private demo; no real customer data is used.</p></div></div>
      <form className="precall-form" onSubmit={submit}>
        <label className="precall-label" htmlFor="demoName">Your name</label>
        <div className="precall-field"><input id="demoName" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ahsaan" autoComplete="name" maxLength={80} /></div>
        <label className="precall-label" htmlFor="demoLocation">Demo service location</label>
        <div className="precall-field"><select id="demoLocation" value={persona} onChange={(event) => setPersona(event.target.value as DemoVisitor["persona"])}>
          <option value="south_hvac">South Austin — HVAC</option>
          <option value="central_plumbing">Central Austin — Plumbing</option>
          <option value="north_hvac">North Austin — HVAC</option>
        </select></div>
        {error && <p className="precall-error" role="alert">{error}</p>}
        <button className="landing-primary-cta precall-cta" type="submit" disabled={busy}>Continue with Google <ArrowRight size={15} /></button>
      </form>
      <p className="precall-footnote">A private recruiter link is required. Booking only happens after your spoken confirmation.</p>
    </div>
  </div>;
}
