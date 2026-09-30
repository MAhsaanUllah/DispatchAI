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
    const searchable = `${job.id} ${job.issueSummary} ${technicians.get(job.technicianId ?? "")?.name ?? ""} ${properties.get(job.propertyId)?.serviceZone ?? ""}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
  });
  const active = cloudJobs.filter((job) => ["BOOKED", "DISPATCHED", "IN_PROGRESS"].includes(job.status)).length;
  const completed = cloudJobs.filter((job) => job.status === "COMPLETED").length;
  const demoWorkOrder = cloudJobs.find((job) => job.id === demoWorkOrderId);

  if (access !== "granted") return <div className="public-dashboard"><header className="public-dashboard-nav"><a href="/" className="public-dashboard-brand">Dispatch<span>AI</span></a></header><main className="public-dashboard-main"><div className="public-dashboard-intro"><div><span className="landing-card-eyebrow">PRIVATE RECRUITER DEMO</span><h1>{access === "loading" ? "Loading dashboard…" : access === "denied" ? "Private access required." : "Dashboard temporarily unavailable."}</h1><p>{access === "denied" ? "Open your one-use invite link and sign in with Google to see live synthetic bookings." : access === "error" ? "Cloud data could not be loaded. Please retry later." : "Checking your demo access."}</p></div><a className="landing-primary-cta" href={demoEmail}><Mail size={16} aria-hidden="true" /> Request access <ArrowRight size={16} aria-hidden="true" /></a></div></main></div>;

  return <div className="public-dashboard">
    <header className="public-dashboard-nav">
      <a href="/" className="public-dashboard-brand"><img src="/favicon.svg" width="34" height="34" alt="" /> Dispatch<span>AI</span></a>
      <a href="/" className="public-dashboard-back"><ArrowLeft size={15} aria-hidden="true" /> Back to home</a>
    </header>
    <main className="public-dashboard-main">
      <div className="public-dashboard-intro"><div><span className="landing-card-eyebrow">OPERATIONS DASHBOARD · LIVE SYNTHETIC DATA</span><h1>Dispatch at a glance.</h1><p>A read-only view of cloud demo bookings. All records are synthetic; staff actions remain private.</p></div><a className="landing-primary-cta" href="/">Try live voice demo <ArrowRight size={16} aria-hidden="true" /></a></div>
      {demoWorkOrder && <section className="public-dashboard-demo-result" aria-label="Your demo work order"><span className="landing-card-eyebrow">YOUR DEMO WORK ORDER</span><h2>{demoWorkOrder.id.replace("wo_", "WO-").toUpperCase()} · {demoWorkOrder.status}</h2><p>{demoWorkOrder.serviceType} · {demoWorkOrder.issueSummary}</p><p>{properties.get(demoWorkOrder.propertyId)?.addressLine1 ?? "Synthetic Austin property"} · {technicians.get(demoWorkOrder.technicianId ?? "")?.name ?? "Technician pending"}</p><p>{demoWorkOrder.scheduledStart ? new Date(demoWorkOrder.scheduledStart).toLocaleString() : "Schedule pending"}</p></section>}
      <div className="public-dashboard-stats"><div><span>WORK ORDERS</span><strong>{cloudJobs.length}</strong></div><div><span>ACTIVE / BOOKED</span><strong>{active}</strong></div><div><span>COMPLETED</span><strong>{completed}</strong></div><div><span>TECHNICIANS</span><strong>{sample.technicians.length}</strong></div></div>
      <section className="public-dashboard-panel" aria-label="Sample work orders">
        <div className="public-dashboard-panel-head"><div><h2>Work orders</h2><p>Cloud demo queue, refreshed every 10 seconds</p></div><span className="public-dashboard-readonly">READ-ONLY</span></div>
        <div className="public-dashboard-filters"><label className="public-dashboard-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search work orders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issue, technician, zone..." /></label><label><span className="sr-only">Service</span><select value={service} onChange={(event) => setService(event.target.value)}><option value="ALL">All services</option><option value="HVAC">HVAC</option><option value="PLUMBING">Plumbing</option></select></label><label><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="BOOKED">Booked</option><option value="DISPATCHED">Dispatched</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select></label></div>
        <div className="public-dashboard-table-wrap"><table><thead><tr><th>JOB</th><th>STATUS</th><th>SERVICE</th><th>ZONE</th><th>ISSUE</th><th>TECHNICIAN</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className={job.id === demoWorkOrderId ? "public-dashboard-highlight" : ""}><td className="public-dashboard-job">{job.id.replace("wo_", "WO-").toUpperCase()}{job.id === demoWorkOrderId && <small> YOUR DEMO WORK ORDER</small>}</td><td><span className={`public-dashboard-status status-${job.status.toLowerCase()}`}>{job.status.replace("_", " ")}</span></td><td>{job.serviceType}</td><td>{properties.get(job.propertyId)?.serviceZone.replace("Austin-", "") ?? "—"}</td><td>{job.issueSummary}</td><td>{technicians.get(job.technicianId ?? "")?.name ?? "Unassigned"}</td></tr>)}</tbody></table>{jobs.length === 0 && <p className="public-dashboard-empty">No cloud work orders match those filters.</p>}</div>
        <div className="public-dashboard-panel-foot">Showing {jobs.length} of {cloudJobs.length} synthetic cloud work orders</div>
      </section>
      <p className="public-dashboard-note">These synthetic bookings are read from the Cloudflare agent database.</p>
    </main>
  </div>;
}
