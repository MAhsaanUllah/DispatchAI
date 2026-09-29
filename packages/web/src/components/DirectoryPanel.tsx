import type { Directory } from "../api.js";

type View = "team" | "services" | "company";

function formatSlot(startAt: string, endAt: string) {
  const options: Intl.DateTimeFormatOptions = { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return `${new Intl.DateTimeFormat("en-US", options).format(new Date(startAt))}–${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(endAt))}`;
}

export function DirectoryPanel({ view, directory, loading }: { view: View; directory: Directory | null; loading: boolean }) {
  const title = { team: "Technician team", services: "Service catalog", company: "Company profile" }[view];
  return <section className="directory-page" aria-label={title}>
    <div className="directory-head">
      <div className="directory-head-persona">
        <img className="directory-avatar" src="/dispatch-agent-avatar.png" alt="DispatchAI voice dispatcher avatar" width="52" height="52" />
        <div>
          <span className="directory-eyebrow">AUSTIN OPERATIONS / DISPATCHER · AIDEN</span>
          <h1>{title}</h1>
        </div>
      </div>
      <span className="directory-pill">Seeded demo data · Read only</span>
    </div>
    {!directory ? <div className="directory-empty">{loading ? "Loading directory…" : "Directory unavailable. Start the local agent and database APIs to view company data."}</div> : null}
    {directory && view === "team" ? <>
      <p className="directory-intro">Skills, service areas and upcoming slots used by availability checks. These are demo schedules, not live technician calendars.</p>
      <div className="directory-grid">
        {directory.technicians.map((tech) => <article className="directory-card" key={tech.id}>
          <div className="directory-card-top"><div className="directory-monogram">{tech.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div><h2>{tech.name}</h2><span className={tech.status === "ACTIVE" ? "directory-status active" : "directory-status"}>{tech.status === "ACTIVE" ? "On roster" : "Off duty"}</span></div></div>
          <div className="directory-detail"><strong>Services</strong><span>{tech.skills.join(" · ")}</span></div>
          <div className="directory-detail"><strong>Coverage</strong><span>{tech.serviceZones.join(", ")}</span></div>
          <div className="directory-detail"><strong>Next open slot</strong><span>{tech.upcomingSlots.find((slot) => slot.status === "AVAILABLE") ? formatSlot(tech.upcomingSlots.find((slot) => slot.status === "AVAILABLE")!.startAt, tech.upcomingSlots.find((slot) => slot.status === "AVAILABLE")!.endAt) : "No open demo slot"}</span></div>
        </article>)}
      </div>
    </> : null}
    {directory && view === "services" ? <>
      <p className="directory-intro">The voice agent can classify these two services and check technician availability. Pricing is not configured.</p>
      <div className="directory-grid">{directory.services.map((service) => <article className="directory-card" key={service.id}><span className="directory-card-kicker">SERVICE / {service.id}</span><h2>{service.name}</h2><p>{service.description}</p><div className="directory-note">{service.priceNote}</div></article>)}</div>
    </> : null}
    {directory && view === "company" ? <div className="directory-card directory-profile"><span className="directory-card-kicker">COMPANY RECORD</span><h2>{directory.company.name}</h2><div className="directory-detail"><strong>Market</strong><span>{directory.company.market}</span></div><div className="directory-detail"><strong>Time zone</strong><span>{directory.company.timeZone}</span></div><div className="directory-detail"><strong>Service areas</strong><span>{directory.company.serviceZones.join(", ")}</span></div><div className="directory-note">{directory.company.note}</div><p className="directory-profile-foot">Company settings and staff authentication are not available in this demo yet.</p></div> : null}
  </section>;
}
