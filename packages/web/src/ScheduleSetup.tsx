import React, { useEffect, useState } from "react";

type Hours = Record<Day, { open: string; close: string } | null>;
type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Service = { id: string; name: string };
type Staff = { id?: string; name: string; skills: string[]; hours?: Hours };
type Props = { onDone: () => void; onBack: () => void; finishLabel?: string };

const DAYS: [Day, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
const idOf = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// Onboarding step 3: what you offer, when you are open, and who works. Saving generates bookable slots.
export function ScheduleSetup({ onDone, onBack, finishLabel = "Finish setup" }: Props) {
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
      setStaff(directory.data.technicians.map((t: Staff & { id: string }) => ({ id: t.id, name: t.name, skills: t.skills, hours: t.hours })));
    }).catch(() => setError("Cannot load your schedule settings."));
  }, []);

  if (!hours) return <p className="wizard__lede">{error || "Loading…"}</p>;

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

  const setOwnHours = (index: number, own: Hours | undefined) => setStaff(staff.map((member, i) => (i === index ? { ...member, hours: own } : member)));

  const toggleSkill = (index: number, skill: string) => setStaff(staff.map((member, i) => i !== index ? member
    : { ...member, skills: member.skills.includes(skill) ? member.skills.filter((s) => s !== skill) : [...member.skills, skill] }));

  return (
    <div className="wizard__body">
      <fieldset className="fieldset">
        <legend>Services</legend>
        {services.map((service, index) => (
          <div key={index} className="staff-row__top">
            <input className="input" aria-label={`Service ${index + 1}`} value={service.name} onChange={(e) => setServices(services.map((s, i) => i === index ? { ...s, name: e.target.value } : s))} />
            <button type="button" className="btn btn--sm" aria-label={`Remove ${service.name || "service"}`} onClick={() => setServices(services.filter((_, i) => i !== index))}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn--sm" onClick={() => setServices([...services, { id: "", name: "" }])}>Add service</button>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Opening hours</legend>
        {DAYS.map(([day, label]) => {
          const value = hours[day];
          return (
            <div key={day} className="hours-row">
              <span>{label}</span>
              <label className="check">
                <input type="checkbox" checked={value !== null} onChange={(e) => setHours({ ...hours, [day]: e.target.checked ? { open: "09:00", close: "17:00" } : null })} />
                Open
              </label>
              {value ? (
                <span className="time-pair">
                  <input className="input" aria-label={`${label} opens`} type="time" value={value.open} onChange={(e) => setHours({ ...hours, [day]: { ...value, open: e.target.value } })} />
                  <span className="field__hint">to</span>
                  <input className="input" aria-label={`${label} closes`} type="time" value={value.close} onChange={(e) => setHours({ ...hours, [day]: { ...value, close: e.target.value } })} />
                </span>
              ) : <span className="field__hint">Closed</span>}
            </div>
          );
        })}
        <label className="field">
          <span className="field__label">Appointment length</span>
          <select className="select" aria-label="Appointment length" value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
            {[30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Staff</legend>
        {staff.length === 0 && <p className="field__hint">No staff yet. Add at least one person and tick the services they do; their open slots are made from your opening hours.</p>}
        {staff.map((member, index) => (
          <div key={member.id ?? `new-${index}`} className="staff-row">
            <div className="staff-row__top">
              <input className="input" aria-label={`Staff ${index + 1} name`} value={member.name} onChange={(e) => setStaff(staff.map((m, i) => i === index ? { ...m, name: e.target.value } : m))} />
              <button type="button" className="btn btn--sm" aria-label={`Remove ${member.name || "staff member"}`} onClick={() => setStaff(staff.filter((_, i) => i !== index))}>Remove</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={!member.hours} onChange={(e) => setOwnHours(index, e.target.checked ? undefined : structuredClone(hours))} />
              Works the business hours
            </label>
            {member.hours && (
              <div className="staff-hours" role="group" aria-label={`${member.name || "Staff member"} working hours`}>
                {DAYS.map(([day, label]) => {
                  const own = member.hours![day];
                  return (
                    <div key={day} className="hours-row">
                      <span>{label}</span>
                      <label className="check">
                        <input type="checkbox" aria-label={`${member.name || "Staff"} works ${label}`} checked={own !== null} onChange={(e) => setOwnHours(index, { ...member.hours!, [day]: e.target.checked ? (hours[day] ?? { open: "09:00", close: "17:00" }) : null })} />
                        Works
                      </label>
                      {own ? (
                        <span className="time-pair">
                          <input className="input" aria-label={`${member.name || "Staff"} starts ${label}`} type="time" value={own.open} onChange={(e) => setOwnHours(index, { ...member.hours!, [day]: { ...own, open: e.target.value } })} />
                          <span className="field__hint">to</span>
                          <input className="input" aria-label={`${member.name || "Staff"} finishes ${label}`} type="time" value={own.close} onChange={(e) => setOwnHours(index, { ...member.hours!, [day]: { ...own, close: e.target.value } })} />
                        </span>
                      ) : <span className="field__hint">Day off</span>}
                    </div>
                  );
                })}
                <p className="field__hint">Customers can only book them inside the business opening hours.</p>
              </div>
            )}
            <div className="skill-list">
              {services.filter((service) => service.name.trim()).map((service) => {
                const skill = idOf(service.name);
                return (
                  <label key={skill} className="check">
                    <input type="checkbox" checked={member.skills.includes(skill)} onChange={() => toggleSkill(index, skill)} />
                    {service.name}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <button type="button" className="btn btn--sm" onClick={() => setStaff([...staff, { name: "", skills: [] }])}>Add staff member</button>
      </fieldset>

      {error && <p role="alert" className="field__error">{error}</p>}
      <div className="wizard__actions">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : finishLabel}
        </button>
      </div>
    </div>
  );
}
