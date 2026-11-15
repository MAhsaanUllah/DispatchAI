import React, { useEffect, useState } from "react";

type Hours = Record<Day, { open: string; close: string } | null>;
type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Service = { id: string; name: string };
type Staff = { id?: string; name: string; skills: string[] };
type Props = { onDone: () => void; onBack: () => void };

const DAYS: [Day, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", fontSize: 14 };
const section: React.CSSProperties = { display: "grid", gap: 10, padding: 16, border: "1px solid var(--border)", borderRadius: 10 };
const idOf = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// Onboarding step 3: what you offer, when you are open, and who works. Saving generates bookable slots.
export function ScheduleSetup({ onDone, onBack }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<Hours | null>(null);
  const [slotMinutes, setSlotMinutes] = useState(60);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/business").then((r) => r.json()), fetch("/api/directory").then((r) => r.json())]).then(([business, directory]) => {
      setServices(business.data.config.services.map((s: Service) => ({ id: s.id, name: s.name })));
      setHours(business.data.config.hours);
      setSlotMinutes(business.data.config.slotMinutes);
      setStaff(directory.data.technicians.map((t: Staff & { id: string }) => ({ id: t.id, name: t.name, skills: t.skills })));
    }).catch(() => setError("Cannot load your schedule settings."));
  }, []);

  if (!hours) return <p>{error || "Loading…"}</p>;

  const save = async () => {
    setError("");
    const named = services.filter((service) => service.name.trim());
    if (named.length === 0) return setError("Add at least one service.");
    if (staff.length === 0) return setError("Add at least one staff member.");
    const serviceIds = new Set(named.map((service) => idOf(service.name)));
    const cleanStaff = staff.map((member) => ({ ...member, name: member.name.trim(), skills: member.skills.filter((skill) => serviceIds.has(skill)) }));
    if (cleanStaff.some((member) => !member.name || member.skills.length === 0)) return setError("Every staff member needs a name and at least one service.");
    setSaving(true);
    try {
      const business = await fetch("/api/business", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ services: named, hours, slotMinutes }) });
      const businessBody = await business.json().catch(() => ({}));
      if (!business.ok) return setError(businessBody?.error?.message?.replace(/^hours\.\w+: /, "Opening hours: ") || "Could not save services and hours.");
      const people = await fetch("/api/staff", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staff: cleanStaff }) });
      const peopleBody = await people.json().catch(() => ({}));
      if (!people.ok) return setError(peopleBody?.error?.message || "Could not save staff.");
      onDone();
    } catch {
      setError("Cannot reach the DispatchAI server.");
    } finally {
      setSaving(false);
    }
  };

  const toggleSkill = (index: number, skill: string) => setStaff(staff.map((member, i) => i !== index ? member
    : { ...member, skills: member.skills.includes(skill) ? member.skills.filter((s) => s !== skill) : [...member.skills, skill] }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <fieldset style={section}>
        <legend style={{ fontWeight: 700 }}>Services</legend>
        {services.map((service, index) => (
          <div key={index} style={{ display: "flex", gap: 8 }}>
            <input aria-label={`Service ${index + 1}`} style={{ ...input, flex: 1 }} value={service.name} onChange={(e) => setServices(services.map((s, i) => i === index ? { ...s, name: e.target.value } : s))} />
            <button type="button" aria-label={`Remove ${service.name || "service"}`} onClick={() => setServices(services.filter((_, i) => i !== index))} style={{ ...input, cursor: "pointer" }}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setServices([...services, { id: "", name: "" }])} style={{ ...input, justifySelf: "start", cursor: "pointer" }}>+ Add service</button>
      </fieldset>

      <fieldset style={section}>
        <legend style={{ fontWeight: 700 }}>Opening hours</legend>
        {DAYS.map(([day, label]) => {
          const value = hours[day];
          return (
            <div key={day} style={{ display: "grid", gridTemplateColumns: "110px auto 1fr", gap: 10, alignItems: "center" }}>
              <span>{label}</span>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={value !== null} onChange={(e) => setHours({ ...hours, [day]: e.target.checked ? { open: "09:00", close: "17:00" } : null })} />
                Open
              </label>
              {value ? (
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input aria-label={`${label} opens`} type="time" style={input} value={value.open} onChange={(e) => setHours({ ...hours, [day]: { ...value, open: e.target.value } })} />
                  –
                  <input aria-label={`${label} closes`} type="time" style={input} value={value.close} onChange={(e) => setHours({ ...hours, [day]: { ...value, close: e.target.value } })} />
                </span>
              ) : <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Closed</span>}
            </div>
          );
        })}
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
          Appointment length
          <select aria-label="Appointment length" style={input} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
            {[30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset style={section}>
        <legend style={{ fontWeight: 700 }}>Staff</legend>
        {staff.map((member, index) => (
          <div key={member.id ?? `new-${index}`} style={{ display: "grid", gap: 6, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input aria-label={`Staff ${index + 1} name`} style={{ ...input, flex: 1 }} value={member.name} onChange={(e) => setStaff(staff.map((m, i) => i === index ? { ...m, name: e.target.value } : m))} />
              <button type="button" aria-label={`Remove ${member.name || "staff member"}`} onClick={() => setStaff(staff.filter((_, i) => i !== index))} style={{ ...input, cursor: "pointer" }}>Remove</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 13 }}>
              {services.filter((service) => service.name.trim()).map((service) => {
                const skill = idOf(service.name);
                return (
                  <label key={skill} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="checkbox" checked={member.skills.includes(skill)} onChange={() => toggleSkill(index, skill)} />
                    {service.name}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setStaff([...staff, { name: "", skills: [] }])} style={{ ...input, justifySelf: "start", cursor: "pointer" }}>+ Add staff member</button>
      </fieldset>

      {error && <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onBack} style={{ ...input, cursor: "pointer" }}>Back</button>
        <button type="button" onClick={save} disabled={saving} style={{ ...input, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)", fontWeight: 600, cursor: saving ? "wait" : "pointer" }}>
          {saving ? "Saving…" : "Finish setup"}
        </button>
      </div>
    </div>
  );
}
