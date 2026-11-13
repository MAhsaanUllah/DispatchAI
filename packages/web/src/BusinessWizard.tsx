import React, { useEffect, useState } from "react";
import { ScheduleSetup } from "./ScheduleSetup.js";
import { TestCall } from "./TestCall.js";
import { BookingMeter } from "./BookingMeter.js";
import { FEATURES, featureById, phoneNote, recommendedFor, RUNS_ON, type RunsOn } from "./features.js";

type Template = { templateId: string; name: string; kind: "onsite" | "instore"; services: string[] };
type Config = { templateId: string; name: string; market: string; timeZone: string; kind: "onsite" | "instore"; serviceZones: string[]; runsOn: RunsOn };
type Business = { config: Config; configured: boolean; canSwitchTemplate: boolean; templates: Template[] };
type Props = { onDone: () => void; onCancel?: () => void };
type StepId = "where" | "type" | "details" | "schedule" | "features" | "test";

const LABELS: Record<string, string> = { "field-service": "Field service", salon: "Salon", "auto-repair": "Auto repair", "home-cleaning": "Home cleaning" };

// Each step says why it matters, so the owner is never filling a form without knowing what it changes.
const STEPS: Record<StepId, { short: string; title: string; why: string }> = {
  where: { short: "Where", title: "Where will DispatchAI run?", why: "This decides what works. Phone calls need a public address, which only a cloud server has today." },
  type: { short: "Business", title: "What kind of business is this?", why: "We start you with the right services and the features that suit it." },
  details: { short: "Details", title: "Business details", why: "Callers hear your business name, and every booking uses your time zone." },
  schedule: { short: "Hours", title: "Services, hours and staff", why: "Bookable times come from your opening hours and who works." },
  features: { short: "Features", title: "Switch on what you need", why: "Each feature automates one more step of a booking. You can change this at any time." },
  test: { short: "First booking", title: "Take your first booking", why: "Hear the agent work before a real customer does." }
};
const CREATE_FLOW: StepId[] = ["where", "type", "details", "schedule", "features", "test"];
const EDIT_FLOW: StepId[] = ["type", "details", "schedule"];

const zonesList = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
};

// Onboarding (six steps) and, from the Company page, editing the same details (three steps).
export function BusinessWizard({ onDone, onCancel }: Props) {
  const flow = onCancel ? EDIT_FLOW : CREATE_FLOW;
  const [business, setBusiness] = useState<Business | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [market, setMarket] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [zones, setZones] = useState("");
  const [runsOn, setRunsOn] = useState<RunsOn>("desktop");
  const [ticked, setTicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/business").then((r) => r.json()).then((body) => {
      const data = body.data as Business;
      setBusiness(data);
      setTemplateId(data.config.templateId);
      setName(data.config.name);
      setMarket(data.config.market);
      setTimeZone(data.config.timeZone);
      setZones(data.config.serviceZones.join("\n"));
      setRunsOn(data.config.runsOn ?? "desktop");
      setTicked(recommendedFor(data.config.templateId));
    }).catch(() => setError("Cannot load business settings."));
  }, []);

  if (!business) return <main className="auth"><p className="auth__lede">{error || "Loading business settings…"}</p></main>;

  const step = flow[stepIndex];
  const next = () => { setError(""); setStepIndex((index) => Math.min(index + 1, flow.length - 1)); };
  const back = () => { setError(""); setStepIndex((index) => Math.max(index - 1, 0)); };

  const chosen = business.templates.find((t) => t.templateId === templateId) ?? business.templates[0];
  const switching = templateId !== business.config.templateId;
  const pick = (template: Template) => {
    setTemplateId(template.templateId);
    setTicked(recommendedFor(template.templateId));
    // A new type starts from its own defaults; the owner edits them in the next step.
    if (template.templateId !== business.config.templateId) {
      setName(template.name);
      setZones("");
    } else {
      setName(business.config.name);
      setZones(business.config.serviceZones.join("\n"));
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const serviceZones = zones.split("\n").map((zone) => zone.trim()).filter(Boolean);
    if (serviceZones.length === 0) return setError(chosen.kind === "instore" ? "Enter your location name." : "Enter at least one service area.");
    setSaving(true);
    try {
      const response = await fetch("/api/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, name, market, timeZone, serviceZones, runsOn })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message: string = body?.error?.message ?? "";
        return setError(message.startsWith("timeZone") ? "Time zone not recognised. Pick one from the list, for example Asia/Karachi."
          : message.startsWith("name") ? "Enter the business name."
          : message || "Could not save. Try again.");
      }
      next();
    } catch {
      setError("Cannot reach the DispatchAI server.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) => setTicked((current) => {
    if (current.includes(id)) return current.filter((item) => item !== id && !(id === "email" && item === "reminders"));
    return id === "reminders" && !current.includes("email") ? [...current, "email", id] : [...current, id];
  });

  const timeZones = zonesList();
  const info = STEPS[step];
  return (
    <main className="auth">
      <div className="wizard">
        <ol className="wizard__steps" aria-label="Setup steps">
          {flow.map((id, index) => (
            <li key={id} aria-current={index === stepIndex ? "step" : undefined} className={`wizard__step ${index === stepIndex ? "wizard__step--current" : index < stepIndex ? "wizard__step--done" : ""}`}>
              {index + 1}. {STEPS[id].short}
            </li>
          ))}
        </ol>

        <div>
          <h1 className="wizard__title">{info.title}</h1>
          <p className="wizard__why">{info.why}</p>
        </div>

        {step === "where" && (
          <>
            <div role="radiogroup" aria-label="Where DispatchAI runs" className="wizard__choices">
              {RUNS_ON.map((option) => (
                <button key={option.id} type="button" role="radio" aria-checked={runsOn === option.id} onClick={() => setRunsOn(option.id)} className={`choice ${runsOn === option.id ? "choice--on" : ""}`}>
                  <span className="choice__name">{option.title}</span>
                  <span className="choice__meta">{option.summary}</span>
                  <ul className="choice__points">{option.points.map((point) => <li key={point}>{point}</li>)}</ul>
                </button>
              ))}
            </div>
            <p className="wizard__lede">You can change this later. The dashboard is the same in both.</p>
            <div className="wizard__actions"><button type="button" className="btn btn--primary" onClick={next}>Next</button></div>
          </>
        )}

        {step === "type" && (
          <>
            {!business.canSwitchTemplate && (
              <p role="note" className="record__note">
                The business type is locked because real bookings exist. You can still edit the details.
              </p>
            )}
            <div role="radiogroup" aria-label="Business type" className="wizard__choices">
              {business.templates.map((template) => {
                const selected = template.templateId === templateId;
                const disabled = !business.canSwitchTemplate && template.templateId !== business.config.templateId;
                return (
                  <button key={template.templateId} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => pick(template)} className={`choice ${selected ? "choice--on" : ""}`}>
                    <span className="choice__name">{LABELS[template.templateId] ?? template.templateId}</span>
                    <span className="choice__meta">{template.kind === "onsite" ? "Staff visit the customer" : "Customer comes to you"}</span>
                    <span className="choice__meta">{template.services.join(", ")}</span>
                    {!onCancel && <span className="choice__meta">Suggested features: {recommendedFor(template.templateId).map((id) => featureById(id)?.name).join(", ")}</span>}
                  </button>
                );
              })}
            </div>
            {switching && business.configured && (
              <p role="note" className="wizard__lede">Changing the type replaces the demo customers, staff and bookings with the demo data of the new type.</p>
            )}
            <div className="wizard__actions">
              {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
              {!onCancel && <button type="button" className="btn" onClick={back}>Back</button>}
              <button type="button" className="btn btn--primary" onClick={next}>Next</button>
            </div>
          </>
        )}

        {step === "details" && (
          <form onSubmit={save} className="wizard__body">
            <label className="field">
              <span className="field__label">Business name</span>
              <input className="input" aria-label="Business name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
            </label>
            <label className="field">
              <span className="field__label">City or area</span>
              <input className="input" aria-label="City or area" value={market} onChange={(e) => setMarket(e.target.value)} required maxLength={80} />
            </label>
            <label className="field">
              <span className="field__label">Time zone</span>
              <input className="input" aria-label="Time zone" list="time-zones" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required placeholder="Asia/Karachi" />
              <datalist id="time-zones">{timeZones.map((zone) => <option key={zone} value={zone} />)}</datalist>
            </label>
            <label className="field">
              <span className="field__label">{chosen.kind === "instore" ? "Location name" : "Service areas (one per line)"}</span>
              <textarea className={`input ${chosen.kind === "instore" ? "input--tall" : "input--taller"}`} aria-label={chosen.kind === "instore" ? "Location name" : "Service areas"} value={zones} onChange={(e) => setZones(e.target.value)} />
            </label>
            {error && <p role="alert" className="field__error">{error}</p>}
            <div className="wizard__actions">
              <button type="button" className="btn" onClick={back}>Back</button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? "Saving…" : "Next"}
              </button>
            </div>
          </form>
        )}

        {step === "schedule" && <ScheduleSetup onDone={onCancel ? onDone : next} onBack={back} finishLabel={onCancel ? "Finish setup" : "Next"} />}

        {step === "features" && (
          <>
            <ul className="picks">
              {FEATURES.map((feature) => (
                <li key={feature.id}>
                  <label className="pick">
                    <input type="checkbox" checked={ticked.includes(feature.id)} onChange={() => toggle(feature.id)} aria-label={feature.name} />
                    <span className="pick__text">
                      <span className="pick__name">{feature.name}</span>
                      <span className="pick__benefit">{feature.benefit}</span>
                      {feature.id === "twilio" && ticked.includes("twilio") && <span className="pick__note">{phoneNote(runsOn)}</span>}
                      {feature.id === "reminders" && ticked.includes("reminders") && <span className="pick__note">Needs Email, so Email is switched on too.</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <BookingMeter live={ticked} />
            <p className="wizard__lede">Nothing is connected yet. Untick what you do not need now and set it up later; the next step lists what is left to connect.</p>
            <div className="wizard__actions">
              <button type="button" className="btn" onClick={back}>Back</button>
              <button type="button" className="btn btn--primary" onClick={next}>Next</button>
            </div>
          </>
        )}

        {step === "test" && <FirstBooking ticked={ticked} runsOn={runsOn} onBack={back} onDone={onDone} />}
      </div>
    </main>
  );
}

// The success moment: one real test booking, then what is left to connect.
function FirstBooking({ ticked, runsOn, onBack, onDone }: { ticked: string[]; runsOn: RunsOn; onBack: () => void; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [bookings, setBookings] = useState(0);
  const [live, setLive] = useState<string[]>([]);
  const refresh = () => {
    fetch("/api/jobs").then((r) => r.json()).then((body) => setBookings(body.data.jobs.length)).catch(() => undefined);
    fetch("/api/plugins").then((r) => r.json()).then((body) => setLive(body.data.plugins.filter((p: { enabled: boolean }) => p.enabled).map((p: { id: string }) => p.id))).catch(() => undefined);
  };
  useEffect(refresh, []);

  const todo = ticked.filter((id) => !live.includes(id));
  const finish = (toFeatures: boolean) => {
    // The dashboard opens on Features when there is something left to connect.
    try { if (toFeatures) sessionStorage.setItem("dispatch.view", "plugins"); } catch { /* storage can be blocked */ }
    onDone();
  };

  return (
    <>
      {bookings > 0
        ? <p className="success" role="status">You took your first booking. It is on your dashboard.</p>
        : <p className="wizard__lede">Press the button and book a visit by voice or by typing, the way a customer would. It uses the same agent as your phone line.</p>}
      <div><button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>{bookings > 0 ? "Try another test call" : "Start a test call"}</button></div>

      <section aria-labelledby="left-title" className="checklist">
        <h2 className="checklist__title" id="left-title">{todo.length === 0 ? "Everything you picked is connected" : "Left to connect"}</h2>
        <ul>
          {ticked.map((id) => {
            const feature = featureById(id);
            if (!feature) return null;
            const done = live.includes(id);
            return (
              <li key={id} className={done ? "checklist__item checklist__item--done" : "checklist__item"}>
                <span className="checklist__name">{feature.name}</span>
                <span className="checklist__state">{done ? "Connected" : id === "twilio" ? phoneNote(runsOn) : id === "email" ? "Add your Resend key, then press Test to send yourself a test email." : "Add it in Features."}</span>
              </li>
            );
          })}
          {ticked.length === 0 && <li className="checklist__item"><span className="checklist__state">You picked no features. Booking still works; add features any time.</span></li>}
        </ul>
      </section>

      <div className="wizard__actions">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        {todo.length > 0 && <button type="button" className="btn" onClick={() => finish(true)}>Finish and open Features</button>}
        <button type="button" className="btn btn--primary" onClick={() => finish(false)}>Finish setup</button>
      </div>
      <TestCall isOpen={open} onClose={() => { setOpen(false); refresh(); }} onTurn={refresh} />
    </>
  );
}
