import { useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Headphones, MapPin, Mic2, ShieldCheck } from "lucide-react";
import { VoiceAgentControl } from "./components/VoiceAgentControl.js";
import { PreCallForm, type VisitorDetails } from "./components/PreCallForm.js";

const demoEmail = "mailto:dev.ahsaan@gmail.com?subject=DispatchAI%20live%20demo%20request";

export function LandingPage() {
  const publicPreview = import.meta.env.MODE === "cloudflare";
  const [preCallOpen, setPreCallOpen] = useState(false);
  const [demoInfoOpen, setDemoInfoOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [visitor, setVisitor] = useState<VisitorDetails | null>(null);
  const [voiceSessionId] = useState(() => `public_demo_${crypto.randomUUID()}`);
  const openDemo = () => publicPreview ? setDemoInfoOpen(true) : setPreCallOpen(true);
  return <div className="landing-shell">
    <a className="landing-skip" href="#main">Skip to content</a>
    <header className="landing-nav">
      <a className="landing-brand" href="/" aria-label="DispatchAI home"><span className="landing-brand-mark"><img src="/favicon.svg" alt="" /></span><span>Dispatch<span className="landing-brand-accent">AI</span></span></a>
      <div className="landing-nav-right"><span className="landing-location"><MapPin size={14} aria-hidden="true" /> Austin, Texas</span><a className="landing-dashboard-link" href="/app">{publicPreview ? "Dashboard preview" : "Staff dashboard"} <ArrowRight size={14} aria-hidden="true" /></a></div>
    </header>

    <main id="main">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span className="landing-kicker-dot" /> HVAC & PLUMBING DISPATCH · AUSTIN, TX</div>
          <h1 id="landing-title">The first step to getting it <em>fixed.</em></h1>
          <p className="landing-lede">“Hi, my AC stopped cooling last night.” The dispatcher can check sample Austin technician availability and guide a confirmed demo booking.</p>
          <div className="landing-hero-actions"><button type="button" className="landing-primary-cta" onClick={openDemo}><Mic2 size={18} aria-hidden="true" /> {publicPreview ? "Request a live voice demo" : "Start a browser call"} <ArrowRight size={17} aria-hidden="true" /></button><span>{publicPreview ? "Available by appointment · contact the developer" : "Voice demo · microphone required"}</span></div>
          <div className="landing-trust-line"><ShieldCheck size={16} aria-hidden="true" /><span>Nothing is booked, moved or cancelled until you say “yes, confirm it.”</span></div>
          <div className="landing-signal-row" aria-label="DispatchAI demo capabilities">
            <span className="landing-signal"><span className="landing-live-badge"><span /> DEMO SCENARIO</span> Austin · 78704</span>
            <span className="landing-signal"><Clock3 size={13} aria-hidden="true" /> Sample appointment windows</span>
            <span className="landing-signal"><CheckCircle2 size={13} aria-hidden="true" /> Human-confirmed booking</span>
          </div>
        </div>
        <div className="landing-call-card" aria-label="Voice assistant preview">
          <div className="landing-call-card-top"><span className="landing-card-eyebrow">YOUR DISPATCH ASSISTANT</span><span className="landing-live-badge"><span /> BROWSER DEMO</span></div>
          <div className="landing-avatar-frame"><img src="/dispatch-agent-avatar.png" width="128" height="128" alt="DispatchAI voice assistant avatar" /></div>
          <h2>Let’s find the right visit.</h2>
          <p>“Kitchen sink draining slow since Monday — 1900 Barton Springs Rd.” The dispatcher greets you by name, pulls up your address, and starts checking windows immediately.</p>
          <div className="landing-call-divider" />
          <div className="landing-call-step"><span>01</span> “What’s going on with the unit?”</div>
          <div className="landing-call-step"><span>02</span> “I have today 3:30 or tomorrow 9:00 open.”</div>
          <div className="landing-call-step"><span>03</span> “Confirming: Thursday 3:30 PM, 78704. Booked.”</div>
        </div>
      </section>

      <section className="landing-how" aria-labelledby="how-title">
        <div className="landing-section-heading"><div><span className="landing-card-eyebrow">A SIMPLE SERVICE FLOW</span><h2 id="how-title">From problem to appointment.</h2></div><p>Clear steps, with a person in control of the final booking.</p></div>
        <div className="landing-how-grid">
          <article><div className="landing-step-icon"><Headphones size={23} aria-hidden="true" /></div><span className="landing-step-number">01 / DESCRIBE</span><h3>Tell us what happened</h3><p>Share your HVAC or plumbing issue, callback number and service address.</p></article>
          <article><div className="landing-step-icon"><Clock3 size={23} aria-hidden="true" /></div><span className="landing-step-number">02 / SCHEDULE</span><h3>Choose an open window</h3><p>The assistant checks matching technicians and available demo appointment slots.</p></article>
          <article><div className="landing-step-icon"><CalendarDays size={23} aria-hidden="true" /></div><span className="landing-step-number">03 / CONFIRM</span><h3>Approve the booking</h3><p>Nothing is booked, moved or cancelled until you clearly confirm the action.</p></article>
        </div>
      </section>

      <section className="landing-bottom-cta" aria-labelledby="bottom-title"><div><span className="landing-card-eyebrow">READY WHEN YOU ARE</span><h2 id="bottom-title">Start with a conversation.</h2><p>{publicPreview ? "The live voice walkthrough is available on request when the demo systems are online." : "Try the DispatchAI browser voice demo with a sample Austin customer record."}</p></div><button type="button" className="landing-primary-cta" onClick={openDemo}>{publicPreview ? "Request a live demo" : "Try the voice assistant"} <ArrowRight size={17} aria-hidden="true" /></button></section>
      <p className="landing-disclaimer"><CheckCircle2 size={14} aria-hidden="true" /> Portfolio demonstration with synthetic customers and schedules. No real emergency service or live email delivery is promised. For immediate danger, contact local emergency services.</p>
    </main>
    <footer className="landing-footer"><span>© 2026 DispatchAI · Austin field-service demo</span><a href="/app">{publicPreview ? "Explore dashboard preview" : "Open staff dashboard"}</a></footer>
    {publicPreview && demoInfoOpen && <div className="landing-demo-overlay" role="presentation" onClick={() => setDemoInfoOpen(false)}><div className="landing-demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-info-title" onClick={(event) => event.stopPropagation()}><span className="landing-card-eyebrow">LIVE DEMO BY REQUEST</span><h2 id="demo-info-title">Contact the developer to arrange a demo.</h2><p>The voice agent, staff dashboard, n8n workflows and sample database are brought online for a scheduled walkthrough. This public page does not start a call or create a booking.</p><a className="landing-primary-cta" href={demoEmail}>Email developer <ArrowRight size={16} aria-hidden="true" /></a><button type="button" className="landing-demo-dismiss" onClick={() => setDemoInfoOpen(false)}>Close</button></div></div>}
    <PreCallForm isOpen={preCallOpen} onCancel={() => setPreCallOpen(false)} onStart={(details) => { setVisitor(details); setPreCallOpen(false); setVoiceOpen(true); }} />
    <VoiceAgentControl isOpen={voiceOpen} onClose={() => setVoiceOpen(false)} sessionId={voiceSessionId} visitor={visitor ?? undefined} autoStart={!!visitor} />
  </div>;
}
