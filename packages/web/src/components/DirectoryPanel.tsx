import type { Directory } from "../api.js";
import { hoursText } from "../hoursText.js";

type View = "team" | "services" | "company";

const VIEW_COPY: Record<View, { title: string; lede: string }> = {
  team: {
    title: "Technician team",
    lede: "Skills, coverage and the next open slot each technician takes."
  },
  services: {
    title: "Service catalog",
    lede: "What the agent can book. A dispatcher confirms any fee before it is quoted."
  },
  company: {
    title: "Company profile",
    lede: "The business the agent books for: market, time zone and coverage."
  }
};

const EDIT_LABEL: Record<View, string> = { team: "Add or edit staff", services: "Add or edit services", company: "Edit business" };

function formatSlot(startAt: string, endAt: string, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return `${new Intl.DateTimeFormat("en-US", options).format(new Date(startAt))} to ${new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(endAt))}`;
}

export function DirectoryPanel({ view, directory, loading, onEdit, onEditHours }: { view: View; directory: Directory | null; loading: boolean; onEdit?: () => void; onEditHours?: () => void }) {
  const { title, lede } = VIEW_COPY[view];
  return <section className="page" aria-label={title}>
    <div className="page__head">
      <div className="page__head-text">
        <h1 className="page__title">{title}</h1>
        <p className="page__lede">{lede}</p>
      </div>
      <div className="page__meta">
        {directory?.demo && <span className="tag tag--quiet">Seeded demo data</span>}
        {onEdit && <button type="button" className="btn btn--primary btn--sm" onClick={onEdit}>{EDIT_LABEL[view]}</button>}
      </div>
    </div>
    {!directory ? <div className="page__note">{loading ? "Loading directory…" : "Directory unavailable. Start the local agent and database APIs to view company data."}</div> : null}
    {directory && view === "team" ? <div className="grid grid--auto">
      {directory.technicians.map((tech) => {
        const next = tech.upcomingSlots.find((slot) => slot.status === "AVAILABLE");
        return <article className="record" key={tech.id}>
          <div className="record__head">
            <h2 className="record__name">{tech.name}</h2>
            <span className="record__meta">{tech.status === "ACTIVE" ? "On roster" : "Off duty"}</span>
          </div>
          <dl className="record__list">
            <div className="record__row"><dt>Services</dt><dd>{tech.skills.join(", ")}</dd></div>
            <div className="record__row"><dt>Coverage</dt><dd>{tech.serviceZones.join(", ")}</dd></div>
            <div className="record__row"><dt>Works</dt><dd>{tech.hours ? hoursText(tech.hours) : `${hoursText(directory.company.hours)} (business hours)`}</dd></div>
            <div className="record__row">
              <dt>Next open slot</dt>
              <dd>{next ? formatSlot(next.startAt, next.endAt, directory.company.timeZone) : "No open slot"}</dd>
            </div>
          </dl>
        </article>;
      })}
    </div> : null}
    {directory && view === "services" ? <div className="grid grid--auto">
      {directory.services.map((service) => <article className="record" key={service.id}>
        <div className="record__head">
          <h2 className="record__name">{service.name}</h2>
          <span className="record__meta">{service.id}</span>
        </div>
        <p className="drawer__text">{service.description}</p>
        <div className="record__note">{service.priceNote}</div>
      </article>)}
    </div> : null}
    {directory && view === "company" ? <>
      <div className="grid grid--auto">
        <article className="record">
          <div className="record__head"><h2 className="record__name">{directory.company.name}</h2></div>
          <p className="drawer__text">{directory.company.note}</p>
        </article>
        <article className="record">
          <div className="record__head"><h2 className="record__name">Market</h2></div>
          <p className="drawer__text">{directory.company.market}</p>
        </article>
        <article className="record">
          <div className="record__head"><h2 className="record__name">Time zone</h2></div>
          <p className="drawer__text drawer__text--mono">{directory.company.timeZone}</p>
        </article>
      </div>
      <article className="record">
        <div className="record__head">
          <h2 className="record__name">Service areas</h2>
          {onEdit && <button type="button" className="btn btn--sm" onClick={onEdit}>Add or remove areas</button>}
        </div>
        <div className="tag-row">
          {directory.company.serviceZones.map((zone) => <span className="tag" key={zone}>{zone}</span>)}
        </div>
      </article>
      <div className="grid grid--auto">
        <article className="record">
          <div className="record__head">
            <h2 className="record__name">Opening hours</h2>
            {onEditHours && <button type="button" className="btn btn--sm" onClick={onEditHours}>Change hours</button>}
          </div>
          <p className="drawer__text">{hoursText(directory.company.hours)}</p>
          <p className="field__hint">Appointments are {directory.company.slotMinutes} minutes long.</p>
        </article>
        <article className="record">
          <div className="record__head">
            <h2 className="record__name">Your agent</h2>
            {onEdit && <button type="button" className="btn btn--sm" onClick={onEdit}>Edit agent</button>}
          </div>
          <dl className="record__list">
            <div className="record__row"><dt>Name</dt><dd>{directory.company.agentName || "Not set"}</dd></div>
            <div className="record__row"><dt>Tone</dt><dd>{directory.company.tone[0].toUpperCase() + directory.company.tone.slice(1)}</dd></div>
          </dl>
          <p className="drawer__text">{directory.company.greeting}</p>
        </article>
      </div>
    </> : null}
  </section>;
}
