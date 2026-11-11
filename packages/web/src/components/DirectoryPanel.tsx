import type { Directory } from "../api.js";

type View = "team" | "services" | "company";

function formatSlot(startAt: string, endAt: string, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return `${new Intl.DateTimeFormat("en-US", options).format(new Date(startAt))} to ${new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(endAt))}`;
}

export function DirectoryPanel({ view, directory, loading }: { view: View; directory: Directory | null; loading: boolean }) {
  const title = { team: "Technician team", services: "Service catalog", company: "Company profile" }[view];
  return <section className="page" aria-label={title}>
    <div className="page__head">
      <div>
        <h1 className="page__title">{title}</h1>
      </div>
      <span className="public__readonly">Seeded demo data, read only</span>
    </div>
    {!directory ? <div className="page__note">{loading ? "Loading directory…" : "Directory unavailable. Start the local agent and database APIs to view company data."}</div> : null}
    {directory && view === "team" ? <>
      <p className="page__lede">Skills, service areas and upcoming slots used by availability checks. These are demo schedules, not live technician calendars.</p>
      <div className="grid-3">
        {directory.technicians.map((tech) => <article className="record" key={tech.id}>
          <div className="record__head">
            <h2 className="record__name">{tech.name}</h2>
            <span className="record__meta">{tech.status === "ACTIVE" ? "On roster" : "Off duty"}</span>
          </div>
          <dl className="record__list">
            <div className="record__row"><dt>Services</dt><dd>{tech.skills.join(", ")}</dd></div>
            <div className="record__row"><dt>Coverage</dt><dd>{tech.serviceZones.join(", ")}</dd></div>
            <div className="record__row">
              <dt>Next open slot</dt>
              <dd>{tech.upcomingSlots.find((slot) => slot.status === "AVAILABLE") ? formatSlot(tech.upcomingSlots.find((slot) => slot.status === "AVAILABLE")!.startAt, tech.upcomingSlots.find((slot) => slot.status === "AVAILABLE")!.endAt, directory.company.timeZone) : "No open demo slot"}</dd>
            </div>
          </dl>
        </article>)}
      </div>
    </> : null}
    {directory && view === "services" ? <>
      <p className="page__lede">The voice agent can classify these services and check technician availability. Pricing is not configured.</p>
      <div className="grid-2">
        {directory.services.map((service) => <article className="record" key={service.id}>
          <div className="record__head">
            <h2 className="record__name">{service.name}</h2>
            <span className="record__meta">{service.id}</span>
          </div>
          <p className="drawer__text">{service.description}</p>
          <div className="record__note">{service.priceNote}</div>
        </article>)}
      </div>
    </> : null}
    {directory && view === "company" ? <div className="record">
      <div className="record__head"><h2 className="record__name">{directory.company.name}</h2></div>
      <dl className="record__list">
        <div className="record__row"><dt>Market</dt><dd>{directory.company.market}</dd></div>
        <div className="record__row"><dt>Time zone</dt><dd>{directory.company.timeZone}</dd></div>
        <div className="record__row"><dt>Service areas</dt><dd>{directory.company.serviceZones.join(", ")}</dd></div>
      </dl>
      <div className="record__note">{directory.company.note}</div>
    </div> : null}
  </section>;
}
