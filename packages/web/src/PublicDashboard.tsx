import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Mail, Search } from "lucide-react";
import { generateSeedData } from "../../domain/src/seed.js";
import type { WorkOrder } from "@dispatchai/shared";

const sample = generateSeedData();
const technicians = new Map(sample.technicians.map((technician) => [technician.id, technician]));
const properties = new Map(sample.properties.map((property) => [property.id, property]));
const demoEmail = "mailto:dev.ahsaan@gmail.com?subject=DispatchAI%20live%20demo%20request";

export function PublicDashboard() {
  const [cloudJobs, setCloudJobs] = useState<WorkOrder[]>([]);
  const [access, setAccess] = useState<"loading" | "granted" | "denied" | "error">("loading");
  const [query, setQuery] = useState("");
  const [service, setService] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [demoWorkOrderId] = useState(() => sessionStorage.getItem("dispatch_demo_work_order") || "");
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const auth = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
        if (auth.status === 401) { if (!cancelled) setAccess("denied"); return; }
        if (!auth.ok) throw new Error("Authentication unavailable");
        const result = await fetch("/api/jobs", { credentials: "same-origin", cache: "no-store" });
        if (!result.ok) throw new Error("Cloud bookings unavailable");
        const body = await result.json() as { ok?: boolean; data?: { jobs?: WorkOrder[] } };
        if (!body.ok || !Array.isArray(body.data?.jobs)) throw new Error("Invalid cloud booking response");
        if (!cancelled) { setCloudJobs(body.data.jobs); setAccess("granted"); }
      } catch { if (!cancelled) setAccess("error"); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  const jobs = cloudJobs.filter((job) => {
    if (service !== "ALL" && job.serviceType !== service) return false;
    if (status !== "ALL" && job.status !== status) return false;
    const searchable = `${job.id} ${job.issueSummary} ${technicians.get(job.technicianId ?? "")?.name ?? ""} ${properties.get(job.propertyId ?? "")?.serviceZone ?? ""}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
  });
  const active = cloudJobs.filter((job) => ["BOOKED", "DISPATCHED", "IN_PROGRESS"].includes(job.status)).length;
  const completed = cloudJobs.filter((job) => job.status === "COMPLETED").length;
  const demoWorkOrder = cloudJobs.find((job) => job.id === demoWorkOrderId);

  if (access !== "granted") return <div className="public"><header className="public__nav"><a href="/" className="public__brand">Dispatch<span className="public__brand-accent">AI</span></a></header><main className="public__main"><div className="public__hero"><div>
    <h1 className="public__title">{access === "loading" ? "Loading dashboard…" : access === "denied" ? "Private access required." : "Dashboard temporarily unavailable."}</h1>
    <p className="public__lede">{access === "denied" ? "Open your one-use invite link and sign in with Google to see live synthetic bookings." : access === "error" ? "Cloud data could not be loaded. Please retry later." : "Checking your demo access."}</p>
  </div><a className="btn btn--primary" href={demoEmail}><Mail size={16} aria-hidden="true" /> Request access</a></div></main></div>;

  return <div className="public">
    <header className="public__nav">
      <a href="/" className="public__brand"><span className="app-nav__mark"><img src="/favicon.svg" width="18" height="18" alt="" /></span>Dispatch<span className="public__brand-accent">AI</span></a>
      <a className="btn btn--sm" href="/"><ArrowLeft size={15} aria-hidden="true" /> Back to home</a>
    </header>
    <main className="public__main">
      <div className="public__hero">
        <div>
          <h1 className="public__title">Dispatch at a glance.</h1>
          <p className="public__lede">A read-only view of cloud demo bookings. All records are synthetic; staff actions remain private.</p>
        </div>
        <a className="btn btn--primary" href="/">Try live voice demo</a>
      </div>
      {demoWorkOrder && <section className="public__demo-result" aria-label="Your demo work order">
        <h2>Your demo work order</h2>
        <p className="public__demo-id">{demoWorkOrder.id.replace("wo_", "WO-")}: {demoWorkOrder.status}</p>
        <p>{demoWorkOrder.serviceType}: {demoWorkOrder.issueSummary}</p>
        <p>{properties.get(demoWorkOrder.propertyId ?? "")?.addressLine1 ?? "Synthetic Austin property"}, {technicians.get(demoWorkOrder.technicianId ?? "")?.name ?? "Technician pending"}</p>
        <p>{demoWorkOrder.scheduledStart ? new Date(demoWorkOrder.scheduledStart).toLocaleString() : "Schedule pending"}</p>
      </section>}
      <div className="public__figures">
        <div className="public__figure"><span className="public__figure-value">{cloudJobs.length}</span><span className="public__figure-label">Work orders</span></div>
        <div className="public__figure"><span className="public__figure-value">{active}</span><span className="public__figure-label">Active and booked</span></div>
        <div className="public__figure"><span className="public__figure-value">{completed}</span><span className="public__figure-label">Completed</span></div>
        <div className="public__figure"><span className="public__figure-value">{sample.technicians.length}</span><span className="public__figure-label">Technicians</span></div>
      </div>
      <section className="public__panel" aria-label="Sample work orders">
        <div className="public__panel-head"><div><h2 className="public__panel-title">Work orders</h2><p className="public__panel-copy">Cloud demo queue, refreshed every 10 seconds</p></div><span className="public__readonly">Read only</span></div>
        <div className="public__filters">
          <label className="public__search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search work orders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issue, technician, zone..." /></label>
          <label><span className="sr-only">Service</span><select className="select" value={service} onChange={(event) => setService(event.target.value)}><option value="ALL">All services</option>{[...new Set(cloudJobs.map((job) => job.serviceType))].map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
          <label><span className="sr-only">Status</span><select className="select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="BOOKED">Booked</option><option value="DISPATCHED">Dispatched</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select></label>
        </div>
        <div className="public__table-wrap"><table>
          <thead><tr><th scope="col">Job</th><th scope="col">Status</th><th scope="col">Service</th><th scope="col">Zone</th><th scope="col">Issue</th><th scope="col">Technician</th></tr></thead>
          <tbody>{jobs.map((job) => <tr key={job.id} className={job.id === demoWorkOrderId ? "is-highlight" : undefined}>
            <td className="public__job-id">{job.id.replace("wo_", "WO-")}{job.id === demoWorkOrderId && <small> Your demo work order</small>}</td>
            <td><span className={`public__readonly ${job.status === "COMPLETED" ? "" : "public__readonly--live"}`}>{job.status.replace("_", " ")}</span></td>
            <td>{job.serviceType}</td>
            <td>{properties.get(job.propertyId ?? "")?.serviceZone.replace("Austin-", "") ?? "Not in a zone"}</td>
            <td>{job.issueSummary}</td>
            <td>{technicians.get(job.technicianId ?? "")?.name ?? "Unassigned"}</td>
          </tr>)}</tbody>
        </table>
        {jobs.length === 0 && <p className="public__panel-foot">No cloud work orders match those filters.</p>}</div>
        <div className="public__panel-foot">Showing {jobs.length} of {cloudJobs.length} synthetic cloud work orders</div>
      </section>
      <p className="public__note">These synthetic bookings are read from the Cloudflare agent database.</p>
    </main>
  </div>;
}
