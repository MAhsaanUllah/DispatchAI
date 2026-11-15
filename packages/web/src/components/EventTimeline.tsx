import React, { useState } from "react";
import { ChevronDown, ChevronRight, Activity } from "lucide-react";
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
      case "WORK_ORDER_RESCHEDULED":
        return { label: evt.type === "WORK_ORDER_CREATED" ? "Work order created" : "Work order rescheduled" };
      case "WORK_ORDER_CANCELLED":
        return { label: "Work order cancelled" };
      case "TOOL_CALL_STARTED":
        return { label: `Executing ${evt.toolName || "tool"}` };
      case "TOOL_CALL_COMPLETED":
        return { label: `${evt.toolName || "Tool"} executed` };
      case "CONFIRMATION_REQUIRED":
        return { label: "Confirmation required" };
      case "TOOL_CALL_FAILED":
      case "ERROR":
        return { label: "Operation failed" };
      default:
        return { label: evt.type.replace(/_/g, " ").toLowerCase() };
    }
  };

  const feedContent = (
    <div className="console__body">
      {events.length === 0 ? (
        <div className="console__notice">No system events recorded yet.</div>
      ) : (
        <div className="timeline">
          {[...events].reverse().map((evt) => {
            const meta = getEventMeta(evt);
            const isExpanded = expandedId === evt.id;

            return (
              <div key={evt.id} className="event">
                <div
                  className="event__head"
                  onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(isExpanded ? null : evt.id); }}
                >
                  <span className="event__label">
                    {isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                    <span>{meta.label}</span>
                  </span>
                  <span className="event__time">{evt.timestamp ? evt.timestamp.substring(11, 19) : ""}</span>
                </div>

                {isExpanded && (
                  <div className="event__detail">
                    <div>Event ID: {evt.id}</div>
                    {evt.payload && (
                      <pre className="event__payload">
                        {JSON.stringify(evt.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (isEmbedded) {
    return feedContent;
  }

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">Operational Activity Stream</span>
        <span className="panel__meta">{events.length} system events</span>
      </div>
      {feedContent}
    </div>
  );
};
