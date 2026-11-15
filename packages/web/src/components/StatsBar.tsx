import React from "react";
import { WorkOrder } from "@dispatchai/shared";

interface StatsBarProps {
  jobs: WorkOrder[];
  companyName?: string;
}

// The figures summarise the same set the table below lists: every work order the server holds.
export const StatsBar: React.FC<StatsBarProps> = ({ jobs, companyName }) => {
  const total = jobs.length;
  const active = jobs.filter((j) => ["BOOKED", "DISPATCHED", "IN_PROGRESS"].includes(j.status)).length;
  const urgent = jobs.filter((j) => j.urgency === "HIGH" && j.status !== "COMPLETED" && j.status !== "CANCELLED").length;
  const completed = jobs.filter((j) => j.status === "COMPLETED").length;

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
