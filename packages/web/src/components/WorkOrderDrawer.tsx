import React, { useEffect } from "react";
import { X, Calendar, MapPin, User, Wrench, ArrowRightLeft, XCircle, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { AgentEvent, WorkOrderView as WorkOrder } from "@dispatchai/shared";

interface WorkOrderDrawerProps {
  job: WorkOrder | null;
  events: AgentEvent[];
  onClose: () => void;
  onQuickAction: (actionText: string) => void;
}

const formatWorkOrderId = (id: string): string => id.replace(/^wo_?/i, "WO-");

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
  switch (evt.type) {
    case "WORK_ORDER_CANCELLED":
      return <XCircle size={13} aria-hidden="true" />;
    case "TOOL_CALL_FAILED":
    case "ERROR":
      return <AlertCircle size={13} aria-hidden="true" />;
    case "WORK_ORDER_RESCHEDULED":
      return <ArrowRightLeft size={13} aria-hidden="true" />;
    case "TOOL_CALL_STARTED":
      return <Wrench size={13} aria-hidden="true" />;
    case "CONFIRMATION_REQUIRED":
      return <Clock size={13} aria-hidden="true" />;
    default:
      return <CheckCircle2 size={13} aria-hidden="true" />;
  }
};

export const WorkOrderDrawer: React.FC<WorkOrderDrawerProps> = ({ job, events, onClose, onQuickAction }) => {
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

  const statusTone = job.status === "CANCELLED" ? "alert"
    : job.status === "COMPLETED" ? "closed"
      : job.status === "IN_PROGRESS" ? "attention" : "live";
  const techName = job.technicianName ?? job.technicianId ?? "Unassigned";
  const propertyAddress = job.propertyAddress ?? (job.propertyId ? job.propertyId : "At the business location");
  const propertyZone = job.zone ?? null;
  const activity = events.filter((evt) => workOrderIdOf(evt) === job.id).reverse();

  return (
    <>
      <div className="overlay" onClick={onClose} />

      <aside className="drawer" aria-label={`Work order ${formatWorkOrderId(job.id)}`}>
        <div className="drawer__head">
          <div>
            <div className="drawer__id">{formatWorkOrderId(job.id)}</div>
            <div className="drawer__sub">
              <span className={`state state__word--${statusTone}`}>
                <span className={`swatch swatch--${statusTone}`} aria-hidden="true" />
                <span className="state__word">{job.status.replace("_", " ")}</span>
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close drawer" className="modal__close">
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="drawer__body">
          <div className="drawer__block">
            <div className="drawer__label">Issue Description</div>
            <p className="drawer__text">{job.issueSummary}</p>
            <div className="drawer__row">
              <span>{job.serviceType}</span>
              {propertyZone && <span className="drawer__key">{propertyZone}</span>}
              {job.urgency === "HIGH" && (
                <span className="swatch swatch--alert" aria-label="High urgency" />
              )}
            </div>
          </div>

          <div className="drawer__block">
            <div className="drawer__label">Technician &amp; Schedule</div>
            <div className="drawer__row">
              <Wrench size={13} aria-hidden="true" />
              <span className="drawer__key">Technician:</span>
              <strong>{techName}</strong>
            </div>
            <div className="drawer__row">
              <Calendar size={13} aria-hidden="true" />
              <span className="drawer__key">Schedule:</span>
              <span className="plate drawer__plate">
                {job.scheduledStart ? job.scheduledStart.replace("T", " ").substring(0, 16) : "Unscheduled"}
              </span>
            </div>
          </div>

          <div className="drawer__block">
            <div className="drawer__label">Customer &amp; Address</div>
            <div className="drawer__row">
              <User size={13} aria-hidden="true" />
              <span className="drawer__key">Customer ID:</span>
              <strong>{job.customerId}</strong>
            </div>
            <div className="drawer__row">
              <MapPin size={13} aria-hidden="true" />
              <span className="drawer__key">Address:</span>
              <span>{propertyAddress}</span>
            </div>
          </div>

          <div className="drawer__block">
            <div className="drawer__label">Operational Activity</div>
            {activity.length === 0 ? (
              <div className="drawer__text drawer__quiet">
                No recorded activity for this work order.
              </div>
            ) : (
              <div className="timeline">
                {activity.map((evt) => (
                  <div key={evt.id} className="event">
                    <div className="event__head">
                      <span className="event__label">
                        {activityIcon(evt)}
                        <span>{activityLabel(evt)}</span>
                      </span>
                      <span className="event__time">{evt.timestamp.substring(11, 19)}</span>
                    </div>
                    {evt.message && <div className="event__detail">{evt.message}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="drawer__actions">
            <div className="drawer__label">Operational Actions</div>
            <button
              type="button"
              className="drawer__action"
              onClick={() => {
                onClose();
                onQuickAction(`Move appointment for work order ${job.id} to latest available slot today`);
              }}
            >
              <ArrowRightLeft size={13} aria-hidden="true" />
              <span>Ask Agent to Reschedule {formatWorkOrderId(job.id)}</span>
            </button>
            <button
              type="button"
              className="drawer__action drawer__action--danger"
              onClick={() => {
                onClose();
                onQuickAction(`Cancel work order ${job.id}`);
              }}
            >
              <XCircle size={13} aria-hidden="true" />
              <span>Ask Agent to Cancel {formatWorkOrderId(job.id)}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
