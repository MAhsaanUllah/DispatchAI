import React, { useEffect, useState } from "react";
import { ScheduleSetup } from "./ScheduleSetup.js";

type Template = { templateId: string; name: string; kind: "onsite" | "instore"; services: string[] };
type Config = { templateId: string; name: string; market: string; timeZone: string; kind: "onsite" | "instore"; serviceZones: string[] };
type Business = { config: Config; configured: boolean; canSwitchTemplate: boolean; templates: Template[] };
type Props = { onDone: () => void; onCancel?: () => void };

const LABELS: Record<string, string> = { "field-service": "Field service", salon: "Salon", "auto-repair": "Auto repair", "home-cleaning": "Home cleaning" };
const STEP_TITLES = ["What kind of business is this?", "Business details", "Services, hours and staff"];

const zonesList = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
};

// Onboarding steps 1 to 2: pick the business type, then the basics. Also used later from the Company page to edit.
export function BusinessWizard({ onDone, onCancel }: Props) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [market, setMarket] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [zones, setZones] = useState("");
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
    }).catch(() => setError("Cannot load business settings."));
  }, []);

  if (!business) return <main className="auth"><p className="auth__lede">{error || "Loading business settings…"}</p></main>;

  const chosen = business.templates.find((t) => t.templateId === templateId) ?? business.templates[0];
  const switching = templateId !== business.config.templateId;
  const pick = (template: Template) => {
    setTemplateId(template.templateId);
    // A new type starts from its own defaults; the owner edits them in step 2.
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
        body: JSON.stringify({ templateId, name, market, timeZone, serviceZones })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message: string = body?.error?.message ?? "";
        return setError(message.startsWith("timeZone") ? "Time zone not recognised. Pick one from the list, for example Asia/Karachi."
          : message.startsWith("name") ? "Enter the business name."
          : message || "Could not save. Try again.");
      }
      setStep(3);
    } catch {
      setError("Cannot reach the DispatchAI server.");
    } finally {
      setSaving(false);
    }
  };

  const timeZones = zonesList();
  return (
    <main className="auth">
      <div className="wizard">
        <ol className="wizard__steps" aria-label="Setup steps">
          {STEP_TITLES.map((title, index) => (
            <li key={title} className={`wizard__step ${step === index + 1 ? "wizard__step--current" : step > index + 1 ? "wizard__step--done" : ""}`}>
              Step {index + 1} of 3
            </li>
          ))}
        </ol>

        <div>
          <h1 className="wizard__title">{STEP_TITLES[step - 1]}</h1>
        </div>

        {step === 3 ? <ScheduleSetup onDone={onDone} onBack={() => setStep(2)} /> : step === 1 ? (
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
                  </button>
                );
              })}
            </div>
            {switching && business.configured && (
              <p role="note" className="wizard__lede">Changing the type replaces the demo customers, staff and bookings with the demo data of the new type.</p>
            )}
            <div className="wizard__actions">
              {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
              <button type="button" className="btn btn--primary" onClick={() => setStep(2)}>Next</button>
            </div>
          </>
        ) : (
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
              <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? "Saving…" : "Next"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
