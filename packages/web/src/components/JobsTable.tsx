import React, { useState, useMemo, useEffect } from "react";
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { WorkOrderView as WorkOrder } from "@dispatchai/shared";

interface JobsTableProps {
  jobs: WorkOrder[];
  selectedJobId: string | null;
  onSelectJob: (job: WorkOrder) => void;
}

const formatWorkOrderId = (id: string): string => id.replace(/^wo_?/i, "WO-");

const formatTimeString = (iso?: string): string => {
  if (!iso) return "Pending";
  const timePart = iso.substring(11, 16);
  const [hStr, mStr] = timePart.split(":");
  const hour = parseInt(hStr, 10);
  if (isNaN(hour)) return timePart;
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${mStr} ${ampm}`;
};

// One swatch per state: the square carries the state, the word beside it carries the meaning.
const STATE_OF = (job: WorkOrder): { tone: "live" | "attention" | "closed" | "alert"; word: string } => {
  const urgent = job.urgency === "HIGH" && job.status !== "COMPLETED" && job.status !== "CANCELLED";
  if (job.status === "CANCELLED") return { tone: "alert", word: "Cancelled" };
  if (job.status === "COMPLETED") return { tone: "closed", word: "Completed" };
  if (job.status === "IN_PROGRESS") return { tone: "attention", word: "In progress" };
  if (job.status === "DISPATCHED") return { tone: "live", word: "Dispatched" };
  if (job.status === "BOOKED") return { tone: "live", word: "Booked" };
  if (job.status === "NEW") return { tone: "closed", word: "New" };
  return { tone: "closed", word: job.status };
};

export const JobsTable: React.FC<JobsTableProps> = ({ jobs, selectedJobId, onSelectJob }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("ALL");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  // Default sort: operational priority, so urgent and active work sits at the top.
  const [sortBy, setSortBy] = useState<"status" | "id" | "time" | "technician">("status");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (serviceFilter !== "ALL" && job.serviceType !== serviceFilter) return false;
      if (statusFilter !== "ALL" && job.status !== statusFilter) return false;

      const zone = job.zone ?? "";
      if (zoneFilter !== "ALL" && zone !== zoneFilter) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const tech = (job.technicianName ?? "").toLowerCase();
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
        // Operational priority: urgent and active work first, finished work last.
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
          const tA = a.scheduledStart || "";
          const tB = b.scheduledStart || "";
          comparison = tA.localeCompare(tB);
        }
      } else if (sortBy === "id") {
        comparison = a.id.localeCompare(b.id);
      } else if (sortBy === "technician") {
        const nameA = a.technicianName ?? "Unassigned";
        const nameB = b.technicianName ?? "Unassigned";
        comparison = nameA.localeCompare(nameB);
      } else {
        const tA = a.scheduledStart || "";
        const tB = b.scheduledStart || "";
        comparison = tA.localeCompare(tB);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [jobs, serviceFilter, zoneFilter, statusFilter, searchTerm, sortBy, sortOrder]);

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
      setSortOrder(col === "status" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (col: "status" | "id" | "time" | "technician") => {
    if (sortBy !== col) return <ArrowUpDown size={11} aria-hidden="true" className="table__sort-idle" />;
    return sortOrder === "asc"
      ? <ArrowUp size={11} aria-hidden="true" />
      : <ArrowDown size={11} aria-hidden="true" />;
  };

  const clearFilters = () => {
    setSearchTerm("");
    setServiceFilter("ALL");
    setZoneFilter("ALL");
    setStatusFilter("ALL");
  };

  const hasFilters = Boolean(searchTerm) || serviceFilter !== "ALL" || zoneFilter !== "ALL" || statusFilter !== "ALL";

  return (
    <>
      <div className="filters">
        <div className="search">
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            aria-label="Search work orders"
            placeholder="Search job, technician, customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")} aria-label="Clear search">
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>

        <select className="select" aria-label="All services" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
          <option value="ALL">All Services</option>
          {[...new Set(jobs.map((job) => job.serviceType))].map((id) => <option key={id} value={id}>{id}</option>)}
        </select>

        <select className="select" aria-label="All zones" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
          <option value="ALL">All Zones</option>
          {[...new Set(jobs.map((job) => job.zone).filter((zone): zone is string => !!zone))].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </select>

        <select className="select" aria-label="All statuses" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All Statuses</option>
          <option value="NEW">New</option>
          <option value="BOOKED">Booked</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {hasFilters && (
          <button type="button" className="btn btn--quiet btn--sm" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      <div className="board__rows">
        <table className="table table--board">
          <caption className="visually-hidden">Work orders, sorted by operational priority</caption>
          <colgroup>
            <col style={{ width: "84px" }} />
            <col style={{ width: "122px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "128px" }} />
            <col />
            <col style={{ width: "122px" }} />
            <col style={{ width: "100px" }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <button type="button" className="table__sort" onClick={() => handleSortToggle("id")}>
                  Job {renderSortIcon("id")}
                </button>
              </th>
              <th scope="col">
                <button type="button" className="table__sort" onClick={() => handleSortToggle("status")}>
                  Status {renderSortIcon("status")}
                </button>
              </th>
              <th scope="col">Service</th>
              <th scope="col">Zone</th>
              <th scope="col">Issue</th>
              <th scope="col">
                <button type="button" className="table__sort" onClick={() => handleSortToggle("technician")}>
                  Technician {renderSortIcon("technician")}
                </button>
              </th>
              <th scope="col" className="table__num">
                <button type="button" className="table__sort" onClick={() => handleSortToggle("time")}>
                  Time {renderSortIcon("time")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {pagedJobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="board__empty">
                  <div className="board__empty-title">No work orders match the filter criteria.</div>
                  <div>Clear the filters to see every work order.</div>
                </td>
              </tr>
            ) : (
              pagedJobs.map((job) => {
                const isSelected = job.id === selectedJobId;
                const state = STATE_OF(job);
                const isHighUrgency = job.urgency === "HIGH" && job.status !== "COMPLETED" && job.status !== "CANCELLED";
                const techName = job.technicianName ?? "Unassigned";
                const zone = job.zone ?? "Not in a zone";

                return (
                  <tr
                    key={job.id}
                    className={isSelected ? "is-selected" : isHighUrgency ? "is-urgent" : job.status === "IN_PROGRESS" ? "is-open" : undefined}
                    onClick={() => onSelectJob(job)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectJob(job); }}
                    tabIndex={0}
                  >
                    <td className="table__id">{formatWorkOrderId(job.id)}</td>
                    <td>
                      <span className={`state state__word--${state.tone}`}>
                        <span className={`swatch swatch--${state.tone}`} aria-hidden="true" />
                        <span className="state__word">{state.word}</span>
                      </span>
                    </td>
                    <td>{job.serviceType}</td>
                    <td>{zone}</td>
                    <td className="table__issue" title={job.issueSummary}>{job.issueSummary}</td>
                    <td title={techName}>{techName}</td>
                    <td className="table__num"><span className="plate">{formatTimeString(job.scheduledStart)}</span></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="board__foot">
        <span>
          Showing <strong>{filteredJobs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, filteredJobs.length)}</strong> of <strong>{filteredJobs.length}</strong>
        </span>
        <div className="board__foot-controls">
          <span>Page {currentPage} of {totalPages}</span>
          <button type="button" className="btn btn--sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>Previous</button>
          <button type="button" className="btn btn--sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>Next</button>
        </div>
      </div>
    </>
  );
};
