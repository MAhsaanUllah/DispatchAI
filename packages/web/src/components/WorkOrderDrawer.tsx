import React, { useEffect } from "react";
import { X, Calendar, MapPin, User, Wrench, ArrowRightLeft, XCircle, CheckCircle2 } from "lucide-react";
import { WorkOrder } from "@dispatchai/shared";

interface WorkOrderDrawerProps {
  job: WorkOrder | null;
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

export const WorkOrderDrawer: React.FC<WorkOrderDrawerProps> = ({ job, onClose, onQuickAction }) => {
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
  const techName = TECH_NAMES[job.technicianId || ""] || "Unassigned";
  const propertyInfo = PROPERTY_DETAILS[job.propertyId] || { address: `${job.propertyId}, Austin, TX`, zone: "Austin-Central" };

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
              <span style={{ color: "var(--border-strong)" }}>•</span>
              <span style={{ color: "var(--text-secondary)" }}>{propertyInfo.zone}</span>
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
              <span style={{ color: "var(--text-primary)" }}>{propertyInfo.address}</span>
            </div>
          </div>

          {/* Operational Activity Timeline (Section 30) */}
          <div className="op-surface-subtle" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Operational Activity
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <CheckCircle2 size={13} color="var(--success)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>Customer identified & zone mapped</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "11.5px" }}>Zone verified as {propertyInfo.zone}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <CheckCircle2 size={13} color="var(--success)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>Technician slot reserved</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "11.5px" }}>Assigned to {techName} for {job.serviceType}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <CheckCircle2 size={13} color="var(--success)" style={{ marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>Work order {formatWorkOrderId(job.id)} confirmed</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "11.5px" }}>Committed via n8n automation</div>
                </div>
              </div>
            </div>
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
