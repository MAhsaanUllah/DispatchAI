import React, { useState } from "react";
import { ArrowUpRight, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronRight, Activity } from "lucide-react";
import { AgentEvent } from "@dispatchai/shared";

interface EventTimelineProps {
  events: AgentEvent[];
  isEmbedded?: boolean;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({ events, isEmbedded = false }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getEventMeta = (evt: AgentEvent) => {
    switch (evt.type) {
      case "WORK_ORDER_CREATED":
        return { color: "var(--success)", label: "Work order created", icon: CheckCircle2 };
      case "WORK_ORDER_RESCHEDULED":
        return { color: "var(--success)", label: "Work order rescheduled", icon: CheckCircle2 };
      case "WORK_ORDER_CANCELLED":
        return { color: "var(--danger)", label: "Work order cancelled", icon: CheckCircle2 };
      case "TOOL_CALL_STARTED":
        return { color: "var(--accent)", label: `Executing ${evt.toolName || "tool"}`, icon: ArrowUpRight };
      case "TOOL_CALL_COMPLETED":
        return { color: "var(--text-primary)", label: `${evt.toolName || "Tool"} executed`, icon: CheckCircle2 };
      case "CONFIRMATION_REQUIRED":
        return { color: "var(--warning)", label: "Confirmation required", icon: Clock };
      case "TOOL_CALL_FAILED":
      case "ERROR":
        return { color: "var(--danger)", label: "Operation failed", icon: AlertCircle };
      default:
        return { color: "var(--text-secondary)", label: evt.type.replace(/_/g, " ").toLowerCase(), icon: Activity };
    }
  };

  const feedContent = (
    <div style={{
      flex: 1,
      overflowY: "auto",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    }}>
      {events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)", fontSize: "12.5px" }}>
          No system events recorded yet.
        </div>
      ) : (
        [...events].reverse().map((evt) => {
          const meta = getEventMeta(evt);
          const Icon = meta.icon;
          const isExpanded = expandedId === evt.id;

          return (
            <div
              key={evt.id}
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-xs)",
                padding: "7px 10px",
                fontSize: "12px"
              }}
            >
              <div
                onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon size={13} color={meta.color} />
                  <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                    {meta.label}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                    {evt.timestamp ? evt.timestamp.substring(11, 19) : ""}
                  </span>
                  {isExpanded ? <ChevronDown size={12} color="var(--text-tertiary)" /> : <ChevronRight size={12} color="var(--text-tertiary)" />}
                </div>
              </div>

              {isExpanded && (
                <div style={{
                  marginTop: "8px",
                  paddingTop: "8px",
                  borderTop: "1px solid var(--border)",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-secondary)"
                }}>
                  <div>Event ID: {evt.id}</div>
                  {evt.payload && (
                    <pre style={{
                      marginTop: "4px",
                      padding: "6px",
                      backgroundColor: "var(--surface-subtle)",
                      borderRadius: "var(--radius-xs)",
                      overflowX: "auto",
                      maxHeight: "140px",
                      fontSize: "10.5px"
                    }}>
                      {JSON.stringify(evt.payload, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  if (isEmbedded) {
    return feedContent;
  }

  return (
    <div className="op-surface" style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 128px)",
      minHeight: "500px",
      maxHeight: "720px"
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "var(--surface)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Activity size={14} color="var(--accent)" />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
            Operational Activity Stream
          </span>
        </div>
        <span style={{
          fontSize: "11px",
          color: "var(--text-secondary)"
        }}>
          {events.length} system events
        </span>
      </div>

      {feedContent}
    </div>
  );
};
