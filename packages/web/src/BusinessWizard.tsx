import React, { useEffect, useState } from "react";
import { ScheduleSetup } from "./ScheduleSetup.js";

type Template = { templateId: string; name: string; kind: "onsite" | "instore"; services: string[] };
type Config = { templateId: string; name: string; market: string; timeZone: string; kind: "onsite" | "instore"; serviceZones: string[] };
type Business = { config: Config; configured: boolean; canSwitchTemplate: boolean; templates: Template[] };
type Props = { onDone: () => void; onCancel?: () => void };

const LABELS: Record<string, string> = { "field-service": "Field service", salon: "Salon", "auto-repair": "Auto repair", "home-cleaning": "Home cleaning" };
const input: React.CSSProperties = { padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 14 };
const label: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 };
const zonesList = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
};

// Onboarding steps 1–2: pick the business type, then the basics. Also used later from the Company page to edit.
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

  if (!business) return <main style={{ padding: 24 }}>{error || "Loading business settings…"}</main>;

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
    // html/body/#root do not scroll (dashboard layout), so this page scrolls itself; otherwise step 3's buttons are unreachable.
    <main style={{ display: "grid", placeItems: "start center", padding: "32px 16px", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 720, display: "grid", gap: 20, padding: 28, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600 }}>STEP {step} OF 3</p>
          <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>{step === 1 ? "What kind of business is this?" : step === 2 ? "Business details" : "Services, hours and staff"}</h1>
        </div>

        {step === 3 ? <ScheduleSetup onDone={onDone} onBack={() => setStep(2)} /> : step === 1 ? (
          <>
            {!business.canSwitchTemplate && (
              <p role="note" style={{ margin: 0, padding: 10, borderRadius: 8, background: "var(--surface-subtle, #f5f5f4)", fontSize: 13 }}>
                The business type is locked because real bookings exist. You can still edit the details.
              </p>
            )}
            <div role="radiogroup" aria-label="Business type" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {business.templates.map((template) => {
                const selected = template.templateId === templateId;
                const disabled = !business.canSwitchTemplate && template.templateId !== business.config.templateId;
                return (
                  <button key={template.templateId} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => pick(template)} style={{
                    textAlign: "left", padding: 14, borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
                    border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`, background: selected ? "var(--accent-soft)" : "var(--surface)"
                  }}>
                    <strong style={{ display: "block", fontSize: 15 }}>{LABELS[template.templateId] ?? template.templateId}</strong>
                    <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                      {template.kind === "onsite" ? "Staff visit the customer" : "Customer comes to you"}
                    </span>
                    <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--text-tertiary)" }}>{template.services.join(", ")}</span>
                  </button>
                );
              })}
            </div>
            {switching && business.configured && (
              <p role="note" style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>Changing the type replaces the demo customers, staff and bookings with the new type's demo data.</p>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {onCancel && <button type="button" onClick={onCancel} style={{ ...input, cursor: "pointer" }}>Cancel</button>}
              <button type="button" onClick={() => setStep(2)} style={{ ...input, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)", cursor: "pointer", fontWeight: 600 }}>Next</button>
            </div>
          </>
        ) : (
          <form onSubmit={save} style={{ display: "grid", gap: 14 }}>
            <label style={label}>
              Business name
              <input aria-label="Business name" style={input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
            </label>
            <label style={label}>
              City or area
              <input aria-label="City or area" style={input} value={market} onChange={(e) => setMarket(e.target.value)} required maxLength={80} />
            </label>
            <label style={label}>
              Time zone
              <input aria-label="Time zone" style={input} list="time-zones" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required placeholder="Asia/Karachi" />
              <datalist id="time-zones">{timeZones.map((zone) => <option key={zone} value={zone} />)}</datalist>
            </label>
            <label style={label}>
              {chosen.kind === "instore" ? "Location name" : "Service areas (one per line)"}
              <textarea aria-label={chosen.kind === "instore" ? "Location name" : "Service areas"} style={{ ...input, minHeight: chosen.kind === "instore" ? 44 : 96, fontFamily: "inherit" }} value={zones} onChange={(e) => setZones(e.target.value)} />
            </label>
            {error && <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setStep(1)} style={{ ...input, cursor: "pointer" }}>Back</button>
              <button type="submit" disabled={saving} style={{ ...input, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)", cursor: saving ? "wait" : "pointer", fontWeight: 600 }}>
                {saving ? "Saving…" : "Next"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
