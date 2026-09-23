import React, { useState, useMemo, useEffect } from "react";
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle } from "lucide-react";
import { WorkOrder } from "@dispatchai/shared";

interface JobsTableProps {
  jobs: WorkOrder[];
  selectedJobId: string | null;
  onSelectJob: (job: WorkOrder) => void;
}

const TECH_NAMES: Record<string, string> = {
  tech_01: "Carlos Mendoza",
  tech_02: "Sarah Jenkins",
  tech_03: "Robert Miller",
  tech_04: "Emily Chen",
  tech_05: "David Taylor",
  tech_06: "Frank Alvarez"
};

const PROPERTY_ZONES: Record<string, string> = {
  prop_201: "Austin-South",
  prop_202: "Austin-South",
  prop_203: "Austin-Central",
  prop_204: "Austin-North",
  prop_205: "Austin-South",
  prop_206: "Austin-East",
  prop_207: "Austin-Central",
  prop_208: "Austin-South",
  prop_209: "Austin-East",
  prop_210: "Austin-North",
  prop_211: "Austin-South",
  prop_212: "Austin-East",
  prop_213: "Austin-Central",
  prop_214: "Austin-North",
  prop_215: "Austin-South",
  prop_216: "Austin-East",
  prop_217: "Austin-Central",
  prop_218: "Austin-North",
  prop_219: "Austin-South",
  prop_220: "Austin-North"
};

// Formats "wo_1001" to "WO-1001" per Section 17
const formatWorkOrderId = (id: string): string => {
  return id.replace(/^wo_?/i, "WO-").toUpperCase();
};

const formatTimeString = (iso?: string): string => {
  if (!iso) return "Pending";
  try {
    const timePart = iso.substring(11, 16);
    const [hStr, mStr] = timePart.split(":");
    const hour = parseInt(hStr, 10);
    if (isNaN(hour)) return timePart;
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${h12}:${mStr} ${ampm}`;
  } catch {
    return "Pending";
  }
};

const formatStatus = (status: string): string => {
  switch (status) {
    case "IN_PROGRESS":
      return "In-Prog";
    case "DISPATCHED":
      return "Dispatched";
    case "BOOKED":
      return "Booked";
    case "NEW":
      return "New";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
};

export const JobsTable: React.FC<JobsTableProps> = ({ jobs, selectedJobId, onSelectJob }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("ALL");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  // Default sort: Status descending (Urgent & Active jobs at top)
  const [sortBy, setSortBy] = useState<"status" | "id" | "time" | "technician">("status");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (serviceFilter !== "ALL" && job.serviceType !== serviceFilter) return false;
      if (statusFilter !== "ALL" && job.status !== statusFilter) return false;

      const zone = PROPERTY_ZONES[job.propertyId] || "Austin-Central";
      if (zoneFilter !== "ALL" && zone !== zoneFilter) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const tech = (TECH_NAMES[job.technicianId || ""] || "").toLowerCase();
        const formattedId = formatWorkOrderId(job.id).toLowerCase();
        const matchId = job.id.toLowerCase().includes(term) || formattedId.includes(term);
        const matchSummary = job.issueSummary.toLowerCase().includes(term);
        const matchCustomer = (job.customerId || "").toLowerCase().includes(term);
        const matchZone = zone.toLowerCase().includes(term);
        if (!matchId && !matchSummary && !matchCustomer && !tech.includes(term) && !matchZone) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === "status") {
        // Operational Priority / Lifecycle Sort:
        // High Urgency Active (5) > In Progress (4) > Dispatched (3) > Booked (2) > New (1) > Completed (0) > Cancelled (-1)
        const getPriorityScore = (j: WorkOrder) => {
          const isActive = ["IN_PROGRESS", "DISPATCHED", "BOOKED"].includes(j.status);
          if (j.urgency === "HIGH" && isActive) return 5;
          if (j.status === "IN_PROGRESS") return 4;
          if (j.status === "DISPATCHED") return 3;
          if (j.status === "BOOKED") return 2;
          if (j.status === "NEW") return 1;
          if (j.status === "COMPLETED") return 0;
          return -1;
        };
        const pA = getPriorityScore(a);
        const pB = getPriorityScore(b);
        if (pA !== pB) {
          comparison = pA - pB;
        } else {
          // Tie-breaker: scheduled time earliest first
          const tA = a.scheduledStart || "";
          const tB = b.scheduledStart || "";
          comparison = tA.localeCompare(tB);
        }
      } else if (sortBy === "id") {
        comparison = a.id.localeCompare(b.id);
      } else if (sortBy === "technician") {
        const nameA = TECH_NAMES[a.technicianId || ""] || "Unassigned";
        const nameB = TECH_NAMES[b.technicianId || ""] || "Unassigned";
        comparison = nameA.localeCompare(nameB);
      } else {
        // Time
        const tA = a.scheduledStart || "";
        const tB = b.scheduledStart || "";
        comparison = tA.localeCompare(tB);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [jobs, serviceFilter, zoneFilter, statusFilter, searchTerm, sortBy, sortOrder]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, serviceFilter, zoneFilter, statusFilter]);

  const totalPages = Math.ceil(filteredJobs.length / pageSize) || 1;
  const pagedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  const handleSortToggle = (col: "status" | "id" | "time" | "technician") => {
    if (sortBy === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      // For status, default to desc (Urgent/Active first)
      setSortOrder(col === "status" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (col: "status" | "id" | "time" | "technician") => {
    const isActive = sortBy === col;
    if (!isActive) {
      return <ArrowUpDown size={11} color="var(--text-tertiary)" style={{ opacity: 0.5 }} />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp size={11} color="var(--accent)" />
    ) : (
      <ArrowDown size={11} color="var(--accent)" />
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setServiceFilter("ALL");
    setZoneFilter("ALL");
    setStatusFilter("ALL");
  };

  return (
    <div className="op-surface" style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 0,
      overflow: "hidden"
    }}>
      {/* Table Header & Operational Filters */}
      <div style={{
        padding: "16px 24px 14px 24px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              Work Orders
            </h2>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              ({filteredJobs.length} of {jobs.length})
            </span>
          </div>

          {(searchTerm || serviceFilter !== "ALL" || zoneFilter !== "ALL" || statusFilter !== "ALL") && (
            <button
              onClick={clearFilters}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                color: "var(--accent)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px"
              }}
            >
              <X size={12} />
              <span>Clear filters</span>
            </button>
          )}
        </div>

        {/* Filter Controls Row (Section 23: Quiet Inputs) */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Search Input */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 12px",
            width: "280px",
            minWidth: "200px"
          }}>
            <Search size={14} color="var(--text-tertiary)" />
            <input
              type="text"
              placeholder="Search job, technician, customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontSize: "12.5px",
                width: "100%"
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
                style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "1px" }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Service Filter (Section 20) */}
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12.5px",
              cursor: "pointer"
            }}
          >
            <option value="ALL">All Services</option>
            <option value="HVAC">HVAC</option>
            <option value="PLUMBING">Plumbing</option>
          </select>

          {/* Zone Filter (Section 21) */}
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12.5px",
              cursor: "pointer"
            }}
          >
            <option value="ALL">All Austin Zones</option>
            <option value="Austin-Central">Austin-Central</option>
            <option value="Austin-North">Austin-North</option>
            <option value="Austin-South">Austin-South</option>
            <option value="Austin-East">Austin-East</option>
          </select>

          {/* Status Filter (Section 18) */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12.5px",
              cursor: "pointer"
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="BOOKED">Booked</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Structured Operational Table (Section 16: 44-52px row height) */}
      {/* Structured Operational Table with Sleek Invisible Slider */}
      <div
        className="table-invisible-scrollbar"
        style={{
          flex: 1,
          minHeight: 0
        }}
      >
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", textAlign: "left", fontSize: "12.5px" }}>
          <colgroup>
            <col style={{ width: "85px" }} />
            <col style={{ width: "115px" }} />
            <col style={{ width: "75px" }} />
            <col style={{ width: "95px" }} />
            <col />
            <col style={{ width: "135px" }} />
            <col style={{ width: "85px" }} />
            <col style={{ width: "75px" }} />
          </colgroup>
          <thead>
            <tr style={{
              backgroundColor: "var(--surface-subtle)",
              borderBottom: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              position: "sticky",
              top: 0,
              zIndex: 10
            }}>
              <th
                onClick={() => handleSortToggle("id")}
                style={{
                  padding: "8px 10px 8px 20px",
                  cursor: "pointer",
                  userSelect: "none",
                  color: sortBy === "id" ? "var(--text-primary)" : "var(--text-secondary)"
                }}
                title="Sort by Job ID"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>Job</span>
                  {renderSortIcon("id")}
                </div>
              </th>
              <th
                onClick={() => handleSortToggle("status")}
                style={{
                  padding: "8px 8px",
                  cursor: "pointer",
                  userSelect: "none",
                  color: sortBy === "status" ? "var(--text-primary)" : "var(--text-secondary)"
                }}
                title="Sort by Operational Status"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>Status</span>
                  {renderSortIcon("status")}
                </div>
              </th>
              <th style={{ padding: "8px 8px" }}>Service</th>
              <th style={{ padding: "8px 8px" }}>Zone</th>
              <th style={{ padding: "8px 12px" }}>Issue</th>
              <th
                onClick={() => handleSortToggle("technician")}
                style={{
                  padding: "8px 8px",
                  cursor: "pointer",
                  userSelect: "none",
                  color: sortBy === "technician" ? "var(--text-primary)" : "var(--text-secondary)"
                }}
                title="Sort by Technician"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>Technician</span>
                  {renderSortIcon("technician")}
                </div>
              </th>
              <th
                onClick={() => handleSortToggle("time")}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  userSelect: "none",
                  textAlign: "right",
                  color: sortBy === "time" ? "var(--text-primary)" : "var(--text-secondary)"
                }}
                title="Sort by Scheduled Time"
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "flex-end", width: "100%" }}>
                  <span>Time</span>
                  {renderSortIcon("time")}
                </div>
              </th>
              <th style={{ padding: "8px 20px 8px 8px", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {pagedJobs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--text-primary)" }}>No work orders match the filter criteria.</div>
                  <div style={{ fontSize: "12px", marginTop: "4px" }}>Try clearing search or filters to see all Austin operations.</div>
                </td>
              </tr>
            ) : (
              pagedJobs.map((job) => {
                const isSelected = job.id === selectedJobId;
                const statusClass = `badge-${job.status.toLowerCase()}`;
                const isHighUrgency = job.urgency === "HIGH" && job.status !== "COMPLETED" && job.status !== "CANCELLED";
                const techName = TECH_NAMES[job.technicianId || ""] || "Unassigned";
                const zone = PROPERTY_ZONES[job.propertyId] || "Austin-Central";

                return (
                  <tr
                    key={job.id}
                    onClick={() => onSelectJob(job)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectJob(job); }}
                    tabIndex={0}
                    style={{
                      height: "41px",
                      borderBottom: "1px solid var(--border)",
                      backgroundColor: isSelected ? "var(--surface-active)" : "transparent",
                      borderLeft: isHighUrgency
                        ? "3px solid var(--danger)"
                        : isSelected
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                      cursor: "pointer",
                      transition: "background-color 0.1s ease"
                    }}
                    onMouseOver={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "var(--surface-subtle)";
                    }}
                    onMouseOut={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    {/* Job ID (Section 17) */}
                    <td style={{ padding: "6px 10px 6px 20px", whiteSpace: "nowrap" }}>
                      <span className="font-mono" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {formatWorkOrderId(job.id)}
                      </span>
                    </td>

                    {/* Status Badge (Compact Operational Mnemonic) */}
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {isHighUrgency ? (
                        <span className="badge badge-urgent" title="High Urgency Work Order">
                          <span className="badge-dot" />
                          <span style={{ fontWeight: 700, letterSpacing: "0.02em" }}>URG</span>
                          <span style={{ opacity: 0.4, margin: "0 2px" }}>·</span>
                          <span>{formatStatus(job.status)}</span>
                        </span>
                      ) : (
                        <span className={`badge ${statusClass}`}>
                          <span className="badge-dot" />
                          <span>{formatStatus(job.status)}</span>
                        </span>
                      )}
                    </td>

                    {/* Service Type (Section 20: Neutral Text) */}
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <span className="tag-service">
                        {job.serviceType}
                      </span>
                    </td>

                    {/* Zone (Section 21: Secondary Text) */}
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <span className="tag-zone">
                        {zone}
                      </span>
                    </td>

                    {/* Issue Summary (Flexible - takes full remaining space without unnecessary truncation) */}
                    <td style={{
                      padding: "6px 12px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--text-primary)"
                    }} title={job.issueSummary}>
                      {job.issueSummary}
                    </td>

                    {/* Technician */}
                    <td style={{
                      padding: "6px 8px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: "var(--text-primary)"
                    }} title={techName}>
                      {techName}
                    </td>

                    {/* Scheduled Time */}
                    <td style={{ padding: "6px 12px", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "12px", textAlign: "right" }}>
                      {formatTimeString(job.scheduledStart)}
                    </td>

                    {/* Action - 20px right padding */}
                    <td style={{ padding: "6px 20px 6px 8px", textAlign: "right" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectJob(job);
                        }}
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-xs)",
                          color: "var(--text-secondary)",
                          padding: "3px 8px",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer"
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Operational Footer (Solves 100-job slider issue cleanly) */}
      <div style={{
        padding: "8px 20px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "var(--surface)",
        flexShrink: 0,
        fontSize: "12px",
        color: "var(--text-secondary)"
      }}>
        <div>
          Showing <strong style={{ color: "var(--text-primary)" }}>{filteredJobs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredJobs.length)}</strong> of <strong style={{ color: "var(--text-primary)" }}>{filteredJobs.length}</strong>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Page {currentPage} of {totalPages}</span>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              style={{
                padding: "3px 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--surface)",
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                opacity: currentPage <= 1 ? 0.4 : 1,
                fontSize: "11.5px",
                color: "var(--text-primary)"
              }}
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              style={{
                padding: "3px 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--surface)",
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                opacity: currentPage >= totalPages ? 0.4 : 1,
                fontSize: "11.5px",
                color: "var(--text-primary)"
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
