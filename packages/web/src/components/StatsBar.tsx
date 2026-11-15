import React from "react";
import { WorkOrder } from "@dispatchai/shared";

interface StatsBarProps {
  jobs: WorkOrder[];
  companyName?: string;
  timeZone?: string;
}

// "Today" is counted in the business time zone (default: the demo business zone).
const localDateKey = (value: Date | string | undefined, timeZone = "America/Chicago"): string | null => {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const StatsBar: React.FC<StatsBarProps> = ({ jobs, companyName, timeZone }) => {
  const todayKey = localDateKey(new Date(), timeZone);
  const todayJobs = jobs.filter((job) => localDateKey(job.scheduledStart, timeZone) === todayKey);

  const total = todayJobs.length;
  const active = todayJobs.filter((j) => ["BOOKED", "DISPATCHED", "IN_PROGRESS"].includes(j.status)).length;
  const urgent = todayJobs.filter((j) => j.urgency === "HIGH" && j.status !== "COMPLETED" && j.status !== "CANCELLED").length;
  const completed = todayJobs.filter((j) => j.status === "COMPLETED").length;

  return (
    <div className="board__figures">
      <div className="figure">
        <span className="figure__value">{total}</span>
        <span className="figure__label">Work Orders</span>
      </div>
      <div className="figure">
        <span className="figure__value">{active}</span>
        <span className="figure__label">Active</span>
      </div>
      <div className="figure">
        <span className="figure__value">{completed}</span>
        <span className="figure__label">Completed</span>
      </div>
      {urgent > 0 && (
        <div className="figure figure--urgent">
          <span className="figure__value">{urgent}</span>
          <span className="figure__label">Urgent</span>
        </div>
      )}
      {companyName && <span className="visually-hidden">{companyName}</span>}
    </div>
  );
};
