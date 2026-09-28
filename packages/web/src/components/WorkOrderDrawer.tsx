import React, { useEffect } from "react";
import { X, Calendar, MapPin, User, Wrench, ArrowRightLeft, XCircle, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { AgentEvent, WorkOrder } from "@dispatchai/shared";

interface WorkOrderDrawerProps {
  job: WorkOrder | null;
  events: AgentEvent[];
  onClose: () => void;
  onQuickAction: (actionText: string) => void;
}

const TECH_NAMES: Record<string, string> = {
  tech_01: "Carlos Mendoza",
  tech_02: "Sarah Jenkins",
  tech_03: "Robert Miller",
  tech_04: "Emily Chen",
  tech_05: "David Taylor",
  tech_06: "Frank Alvarez"
};

const PROPERTY_DETAILS: Record<string, { address: string; zone: string }> = {
  prop_201: { address: "1402 South Congress Ave, 78704", zone: "Austin-South" },
  prop_202: { address: "2201 Barton Springs Rd, 78704", zone: "Austin-South" },
  prop_203: { address: "504 Colorado St, 78701", zone: "Austin-Central" },
  prop_204: { address: "11410 Century Oaks Terrace, 78758", zone: "Austin-North" },
  prop_205: { address: "4208 Manchaca Rd, 78704", zone: "Austin-South" },
  prop_206: { address: "1905 E 6th St, 78702", zone: "Austin-East" },
  prop_207: { address: "3810 Speedway, 78751", zone: "Austin-Central" },
  prop_208: { address: "2600 S Lamar Blvd, 78704", zone: "Austin-South" },
  prop_209: { address: "4550 Mueller Blvd, 78723", zone: "Austin-East" },
  prop_210: { address: "9500 Burnet Rd, 78758", zone: "Austin-North" }
};

const formatWorkOrderId = (id: string): string => {
  return id.replace(/^wo_?/i, "WO-").toUpperCase();
};

const workOrderIdOf = (evt: AgentEvent): string | null => {
  const payload = evt.payload ?? {};
  if (typeof payload.workOrderId === "string") return payload.workOrderId;
  if (typeof payload.id === "string" && payload.id.startsWith("wo_")) return payload.id;
  const workOrder = payload.workOrder as { id?: unknown } | undefined;
  if (workOrder && typeof workOrder.id === "string") return workOrder.id;
  const pending = payload.payload as { workOrderId?: unknown } | undefined;
  if (pending && typeof pending.workOrderId === "string") return pending.workOrderId;
  return null;
};

const activityLabel = (evt: AgentEvent): string => {
  switch (evt.type) {
    case "WORK_ORDER_CREATED":
      return "Work order created";
    case "WORK_ORDER_RESCHEDULED":
      return "Work order rescheduled";
    case "WORK_ORDER_CANCELLED":
      return "Work order cancelled";
    case "TOOL_CALL_STARTED":
      return `Executing ${evt.toolName ?? "tool"}`;
    case "TOOL_CALL_COMPLETED":
      return `${evt.toolName ?? "Tool"} executed`;
    case "TOOL_CALL_FAILED":
      return `${evt.toolName ?? "Tool"} failed`;
    case "CONFIRMATION_REQUIRED":
      return "Confirmation required";
    case "RETRY_STARTED":
      return "Retrying after transient failure";
    case "ERROR":
      return "Operation failed";
    default:
      return "State updated";
  }
};

const activityIcon = (evt: AgentEvent): React.ReactNode => {
  const base = { size: 13, style: { marginTop: "2px", flexShrink: 0 } };
  switch (evt.type) {
    case "WORK_ORDER_CANCELLED":
      return <XCircle {...base} color="var(--danger)" />;
    case "TOOL_CALL_FAILED":
    case "ERROR":
      return <AlertCircle {...base} color="var(--danger)" />;
    case "WORK_ORDER_RESCHEDULED":
      return <ArrowRightLeft {...base} color="var(--accent)" />;
    case "TOOL_CALL_STARTED":
      return <Wrench {...base} color="var(--text-secondary)" />;
    case "CONFIRMATION_REQUIRED":
      return <Clock {...base} color="var(--accent)" />;
    default:
      return <CheckCircle2 {...base} color="var(--success)" />;
  }
};

export const WorkOrderDrawer: React.FC<WorkOrderDrawerProps> = ({ job, events, onClose, onQuickAction }) => {
  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && job) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [job, onClose]);

  if (!job) return null;

  const statusClass = `badge-${job.status.toLowerCase()}`;
  const techName = job.technicianId ? TECH_NAMES[job.technicianId] ?? job.technicianId : "Unassigned";
  const propertyInfo = PROPERTY_DETAILS[job.propertyId] ?? null;
  const propertyAddress = propertyInfo?.address ?? job.propertyId;
  const propertyZone = propertyInfo?.zone ?? null;
  const activity = events.filter((evt) => workOrderIdOf(evt) === job.id).reverse();

  return (
    <>
      {/* Accessible Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.25)",
          zIndex: 50,
          animation: "fadeIn 0.15s ease"
        }}
      />

      {/* Slide-over Drawer Panel (Section 30: 10px radius max, operational readability) */}
      <aside style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "460px",
        maxWidth: "92vw",
        backgroundColor: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        borderTopLeftRadius: "var(--radius-drawer)",
        borderBottomLeftRadius: "var(--radius-drawer)",
        boxShadow: "var(--shadow-drawer)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        animation: "slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Drawer Header */}
        <div style={{
          padding: "18px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--surface)"
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="font-mono" style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {formatWorkOrderId(job.id)}
              </span>
              <span className={`badge ${statusClass}`}>
                <span className="badge-dot" />
                <span>{job.status.replace("_", " ")}</span>
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              Austin Field Service Operations
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "5px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Drawer Content */}
        <div style={{
          padding: "24px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          flex: 1
        }}>
          {/* Issue Details Section */}
          <div className="op-surface-subtle" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Issue Description
            </div>
            <p style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--text-primary)", marginTop: "4px" }}>
              {job.issueSummary}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", fontSize: "12px" }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{job.serviceType}</span>
              {propertyZone && (
                <>
                  <span style={{ color: "var(--border-strong)" }}>•</span>
                  <span style={{ color: "var(--text-secondary)" }}>{propertyZone}</span>
                </>
              )}
              {job.urgency === "HIGH" && (
                <>
                  <span style={{ color: "var(--border-strong)" }}>•</span>
                  <span style={{ color: "var(--danger)", fontWeight: 600 }}>High Urgency</span>
                </>
              )}
            </div>
          </div>

          {/* Schedule & Assignment Section */}
          <div className="op-surface-subtle" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Technician & Schedule
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
              <Wrench size={14} color="var(--text-secondary)" />
              <span style={{ color: "var(--text-secondary)" }}>Technician:</span>
              <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{techName}</strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px" }}>
              <Calendar size={14} color="var(--text-secondary)" />
              <span style={{ color: "var(--text-secondary)" }}>Schedule:</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                {job.scheduledStart ? job.scheduledStart.replace("T", " · ").substring(0, 19) : "Unscheduled"}
              </span>
            </div>
          </div>

          {/* Customer & Location Section */}
          <div className="op-surface-subtle" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Customer & Address
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
              <User size={14} color="var(--text-secondary)" />
              <span style={{ color: "var(--text-secondary)" }}>Customer ID:</span>
              <strong className="font-mono" style={{ color: "var(--text-primary)" }}>{job.customerId}</strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px" }}>
              <MapPin size={14} color="var(--text-secondary)" />
              <span style={{ color: "var(--text-secondary)" }}>Address:</span>
              <span style={{ color: "var(--text-primary)" }}>{propertyAddress}</span>
            </div>
          </div>

          {/* Operational Activity Timeline (Section 30) — derived only from real agent events */}
          <div className="op-surface-subtle" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Operational Activity
            </div>
            {activity.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                No recorded activity for this work order.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
                {activity.map((evt) => (
                  <div key={evt.id} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    {activityIcon(evt)}
                    <div>
                      <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{activityLabel(evt)}</div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "11.5px" }}>
                        {evt.timestamp.substring(11, 19)}
                        {evt.message ? ` · ${evt.message}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Operational Actions (Section 22) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "auto", paddingTop: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Operational Actions
            </div>

            <button
              onClick={() => {
                onClose();
                onQuickAction(`Move appointment for work order ${job.id} to latest available slot today`);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "12.5px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 0.12s ease"
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-subtle)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
            >
              <ArrowRightLeft size={14} color="var(--accent)" />
              <span>Ask Agent to Reschedule {formatWorkOrderId(job.id)}</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onQuickAction(`Cancel work order ${job.id}`);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--danger)",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "12.5px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 0.12s ease"
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--danger-soft)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--surface)")}
            >
              <XCircle size={14} color="var(--danger)" />
              <span>Ask Agent to Cancel {formatWorkOrderId(job.id)}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
