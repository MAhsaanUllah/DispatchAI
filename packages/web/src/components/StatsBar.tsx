import React from "react";
import { WorkOrder } from "@dispatchai/shared";

interface StatsBarProps {
  jobs: WorkOrder[];
}

export const StatsBar: React.FC<StatsBarProps> = ({ jobs }) => {
  const total = jobs.length;
  const active = jobs.filter((j) => ["BOOKED", "DISPATCHED", "IN_PROGRESS"].includes(j.status)).length;
  const urgent = jobs.filter((j) => j.urgency === "HIGH" && j.status !== "COMPLETED" && j.status !== "CANCELLED").length;
  const completed = jobs.filter((j) => j.status === "COMPLETED").length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
        padding: "8px 20px",
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        marginBottom: "12px",
        fontSize: "12.5px",
        flexShrink: 0
      }}
    >
      {/* Compact Operational KPI Command Strip */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <span style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.05em",
          color: "var(--text-secondary)",
          backgroundColor: "var(--surface-subtle)",
          border: "1px solid var(--border)",
          padding: "2px 7px",
          borderRadius: "var(--radius-xs)",
          textTransform: "uppercase"
        }}>
          Today
        </span>

        <span style={{ height: "14px", width: "1px", backgroundColor: "var(--border)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <strong style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "13px" }}>{total}</strong>
          <span style={{ color: "var(--text-secondary)" }}>Work Orders</span>
        </div>

        <span style={{ height: "14px", width: "1px", backgroundColor: "var(--border)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <strong style={{ color: "var(--accent)", fontWeight: 700, fontSize: "13px" }}>{active}</strong>
          <span style={{ color: "var(--text-secondary)" }}>Active</span>
        </div>

        {urgent > 0 && (
          <>
            <span style={{ height: "14px", width: "1px", backgroundColor: "var(--border)" }} />
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "var(--danger-soft)",
              border: "1px solid #FECACA",
              padding: "2px 8px",
              borderRadius: "var(--radius-xs)"
            }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "var(--danger)" }} />
              <strong style={{ color: "var(--danger)", fontWeight: 700, fontSize: "12.5px" }}>{urgent}</strong>
              <span style={{ color: "var(--danger)", fontWeight: 600, fontSize: "12px" }}>Urgent</span>
            </div>
          </>
        )}

        <span style={{ height: "14px", width: "1px", backgroundColor: "var(--border)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <strong style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{completed}</strong>
          <span style={{ color: "var(--text-tertiary)" }}>Completed</span>
        </div>
      </div>

      {/* Austin Market Note */}
      <div className="hide-on-mobile" style={{ fontSize: "11.5px", color: "var(--text-tertiary)", fontWeight: 500 }}>
        Austin Metro Service Dispatch
      </div>
    </div>
  );
};
