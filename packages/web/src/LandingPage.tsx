import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Headphones, MapPin, Mic2, ShieldCheck } from "lucide-react";
import { VoiceAgentControl } from "./components/VoiceAgentControl.js";
import { PreCallForm, type VisitorDetails } from "./components/PreCallForm.js";
import { DemoEntryForm, type DemoVisitor } from "./components/DemoEntryForm.js";

export function LandingPage() {
  const publicPreview = import.meta.env.MODE === "cloudflare";
  const [preCallOpen, setPreCallOpen] = useState(false);
  const [demoInfoOpen, setDemoInfoOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [visitor, setVisitor] = useState<VisitorDetails | DemoVisitor | null>(null);
  const [voiceSessionId] = useState(() => `public_demo_${crypto.randomUUID()}`);
  const openDemo = () => publicPreview ? setDemoInfoOpen(true) : setPreCallOpen(true);
  useEffect(() => {
    if (!publicPreview || new URLSearchParams(window.location.search).get("voice") !== "1") return;
    void fetch("/api/auth/me").then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.name && data?.persona) { setVisitor({ name: data.name, persona: data.persona }); setVoiceOpen(true); }
    });
  }, [publicPreview]);
  const continueDemo = async (details: DemoVisitor) => {
    const authenticated = await fetch("/api/auth/me").then((response) => response.ok);
    if (authenticated) {
      const response = await fetch("/api/demo/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) });
      if (!response.ok) throw new Error("Could not save demo location");
      setVisitor(details); setDemoInfoOpen(false); setVoiceOpen(true);
      return;
    }
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (!invite) throw new Error("Open the private recruiter link to continue.");
    const query = new URLSearchParams({ invite, name: details.name, persona: details.persona });
    window.location.assign(`/api/auth/google?${query}`);
  };
  return <div className="public">
    <a className="public__skip" href="#main">Skip to content</a>
    <header className="public__nav">
      <a className="public__brand" href="/" aria-label="DispatchAI home"><span className="app-nav__mark"><img src="/favicon.svg" alt="" width="18" height="18" /></span><span>Dispatch<span className="public__brand-accent">AI</span></span></a>
      <div className="public__nav-right"><span className="public__location"><MapPin size={14} aria-hidden="true" /> Austin, Texas</span><a className="btn btn--sm" href="/app">{publicPreview ? "Access dashboard" : "Staff dashboard"}</a></div>
    </header>

    <main id="main">
      <section className="public__hero" aria-labelledby="landing-title">
        <div>
          <h1 className="public__title" id="landing-title">The first step to getting it fixed.</h1>
          <p className="public__lede">“Hi, my AC stopped cooling last night.” The dispatcher checks sample Austin technician availability and guides a confirmed demo booking.</p>
          <div className="public__actions">
            <button type="button" className="btn btn--primary" onClick={openDemo}><Mic2 size={16} aria-hidden="true" /> {publicPreview ? "Try live voice demo" : "Start a browser call"}</button>
            <span className="public__actions-note">Voice demo, microphone required</span>
          </div>
          <div className="public__trust"><ShieldCheck size={16} aria-hidden="true" /><span>Nothing is booked, moved or cancelled until you say “yes, confirm it.”</span></div>
        </div>
        <div className="public__card" aria-label="Voice assistant preview">
          <div className="public__card-head">
            <span className="public__card-label">Your dispatch assistant</span>
            <span className="public__card-label">Browser demo</span>
          </div>
          <div className="public__avatar"><img src="/dispatch-agent-avatar.png" width="84" height="84" alt="DispatchAI voice assistant avatar" /></div>
          <h2 className="public__card-title">Let’s find the right visit.</h2>
          <p className="public__card-copy">“Kitchen sink draining slow since Monday, 1900 Barton Springs Rd.” The dispatcher asks for the address, checks windows immediately and never books without your yes.</p>
          <ol className="public__steps">
            <li><span className="public__step-num">01</span><span>“What’s going on with the unit?”</span></li>
            <li><span className="public__step-num">02</span><span>“I have today 3:30 or tomorrow 9:00 open.”</span></li>
            <li><span className="public__step-num">03</span><span>“Confirming: Thursday 3:30 PM, 78704. Booked.”</span></li>
          </ol>
        </div>
      </section>

      <section className="public__band" aria-labelledby="how-title">
        <div className="public__band-inner">
          <div className="public__step">
            <span className="public__step-num">01</span>
            <h3 className="public__step-name">Tell us what happened</h3>
            <p className="public__step-copy">Share your HVAC or plumbing issue, callback number and service address.</p>
          </div>
          <div className="public__step">
            <span className="public__step-num">02</span>
            <h3 className="public__step-name">Choose an open window</h3>
            <p className="public__step-copy">The assistant checks matching technicians and available demo appointment slots.</p>
          </div>
          <div className="public__step">
            <span className="public__step-num">03</span>
            <h3 className="public__step-name">Approve the booking</h3>
            <p className="public__step-copy">Nothing is booked, moved or cancelled until you clearly confirm the action.</p>
          </div>
        </div>
      </section>

      <section className="public__cta" aria-labelledby="bottom-title">
        <div>
          <h2 className="public__cta-title" id="bottom-title">Start with a conversation.</h2>
          <p className="public__cta-copy">Try the DispatchAI browser voice demo with a sample Austin customer record.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openDemo}>Try live voice demo</button>
      </section>
      <p className="public__main"><CheckCircle2 size={14} aria-hidden="true" /> Portfolio demonstration with synthetic customers and schedules. No real emergency service or live email delivery is promised. For immediate danger, contact local emergency services.</p>
    </main>
    <footer className="public__foot"><span>© 2026 DispatchAI, Austin field-service demo</span><a href="/app">Access dashboard</a></footer>
    {publicPreview && demoInfoOpen && <DemoEntryForm onCancel={() => setDemoInfoOpen(false)} onContinue={continueDemo} />}
    <PreCallForm isOpen={preCallOpen} onCancel={() => setPreCallOpen(false)} onStart={(details) => { setVisitor(details); setPreCallOpen(false); setVoiceOpen(true); }} />
    <VoiceAgentControl isOpen={voiceOpen} onClose={() => setVoiceOpen(false)} sessionId={voiceSessionId} visitor={visitor ?? undefined} autoStart={!publicPreview && !!visitor} />
  </div>;
}
