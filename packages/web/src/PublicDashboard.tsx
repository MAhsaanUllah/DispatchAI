import { useState } from "react";
import { ArrowLeft, ArrowRight, Mail, Search } from "lucide-react";
import { generateSeedData } from "../../domain/src/seed.js";

const sample = generateSeedData();
const technicians = new Map(sample.technicians.map((technician) => [technician.id, technician]));
const properties = new Map(sample.properties.map((property) => [property.id, property]));
const demoEmail = "mailto:dev.ahsaan@gmail.com?subject=DispatchAI%20live%20demo%20request";

export function PublicDashboard() {
  const [query, setQuery] = useState("");
  const [service, setService] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const jobs = sample.workOrders.filter((job) => {
    if (service !== "ALL" && job.serviceType !== service) return false;
    if (status !== "ALL" && job.status !== status) return false;
    const searchable = `${job.id} ${job.issueSummary} ${technicians.get(job.technicianId ?? "")?.name ?? ""} ${properties.get(job.propertyId)?.serviceZone ?? ""}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
  });
  const active = sample.workOrders.filter((job) => ["BOOKED", "DISPATCHED", "IN_PROGRESS"].includes(job.status)).length;
  const completed = sample.workOrders.filter((job) => job.status === "COMPLETED").length;

  return <div className="public-dashboard">
    <header className="public-dashboard-nav">
      <a href="/" className="public-dashboard-brand"><img src="/favicon.svg" width="34" height="34" alt="" /> Dispatch<span>AI</span></a>
      <a href="/" className="public-dashboard-back"><ArrowLeft size={15} aria-hidden="true" /> Back to home</a>
    </header>
    <main className="public-dashboard-main">
      <div className="public-dashboard-intro"><div><span className="landing-card-eyebrow">OPERATIONS DASHBOARD · SAMPLE DATA</span><h1>Dispatch at a glance.</h1><p>A read-only look at the Austin field-service workspace. These are synthetic records from the project fixtures—not live customer or staff data.</p></div><a className="landing-primary-cta" href={demoEmail}><Mail size={16} aria-hidden="true" /> Request live demo <ArrowRight size={16} aria-hidden="true" /></a></div>
      <div className="public-dashboard-stats"><div><span>WORK ORDERS</span><strong>{sample.workOrders.length}</strong></div><div><span>ACTIVE / BOOKED</span><strong>{active}</strong></div><div><span>COMPLETED</span><strong>{completed}</strong></div><div><span>TECHNICIANS</span><strong>{sample.technicians.length}</strong></div></div>
      <section className="public-dashboard-panel" aria-label="Sample work orders">
        <div className="public-dashboard-panel-head"><div><h2>Work orders</h2><p>Explore the sample dispatch queue</p></div><span className="public-dashboard-readonly">READ-ONLY PREVIEW</span></div>
        <div className="public-dashboard-filters"><label className="public-dashboard-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search work orders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issue, technician, zone..." /></label><label><span className="sr-only">Service</span><select value={service} onChange={(event) => setService(event.target.value)}><option value="ALL">All services</option><option value="HVAC">HVAC</option><option value="PLUMBING">Plumbing</option></select></label><label><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="BOOKED">Booked</option><option value="DISPATCHED">Dispatched</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select></label></div>
        <div className="public-dashboard-table-wrap"><table><thead><tr><th>JOB</th><th>STATUS</th><th>SERVICE</th><th>ZONE</th><th>ISSUE</th><th>TECHNICIAN</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td className="public-dashboard-job">{job.id.replace("wo_", "WO-").toUpperCase()}</td><td><span className={`public-dashboard-status status-${job.status.toLowerCase()}`}>{job.status.replace("_", " ")}</span></td><td>{job.serviceType}</td><td>{properties.get(job.propertyId)?.serviceZone.replace("Austin-", "") ?? "—"}</td><td>{job.issueSummary}</td><td>{technicians.get(job.technicianId ?? "")?.name ?? "Unassigned"}</td></tr>)}</tbody></table>{jobs.length === 0 && <p className="public-dashboard-empty">No sample work orders match those filters.</p>}</div>
        <div className="public-dashboard-panel-foot">Showing {jobs.length} of {sample.workOrders.length} synthetic work orders</div>
      </section>
      <p className="public-dashboard-note">For a guided voice and booking walkthrough, email the developer. The operational dashboard and n8n workflows are run locally during scheduled demos.</p>
    </main>
  </div>;
}
