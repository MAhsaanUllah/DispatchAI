import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Navbar } from "./Navbar.js";
import { StatsBar } from "./StatsBar.js";
import { WorkOrderDrawer } from "./WorkOrderDrawer.js";
import { AgentChat } from "./AgentChat.js";
import type { AgentState } from "@dispatchai/agent";
import type { AgentEvent, WorkOrder } from "@dispatchai/shared";

const makeJob = (overrides: Partial<WorkOrder>): WorkOrder => ({
  id: "wo_1001",
  customerId: "cust_101",
  propertyId: "prop_201",
  technicianId: "tech_01",
  serviceType: "HVAC",
  issueSummary: "Unit not cooling",
  urgency: "STANDARD",
  status: "BOOKED",
  createdBy: "WEB_AGENT",
  createdAt: "2026-09-18T08:00:00Z",
  updatedAt: "2026-09-18T08:00:00Z",
  ...overrides
});

const makeEvent = (overrides: Partial<AgentEvent> & Pick<AgentEvent, "id" | "type">): AgentEvent => ({
  timestamp: "2026-09-28T15:04:05Z",
  correlationId: "corr_test",
  ...overrides
});

const visibleText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("StatsBar: the Today metrics use real work-order schedule data", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts only work orders scheduled for today in the app timezone", () => {
    vi.useFakeTimers();
    // 2026-09-29T02:00:00Z is still 2026-09-28 (21:00) in America/Chicago.
    vi.setSystemTime(new Date("2026-09-29T02:00:00Z"));

    const html = renderToStaticMarkup(
      <StatsBar
        jobs={[
          makeJob({ id: "wo_today", scheduledStart: "2026-09-29T02:00:00Z", status: "BOOKED" }),
          makeJob({ id: "wo_past", scheduledStart: "2026-09-20T15:00:00Z", status: "COMPLETED", urgency: "HIGH" }),
          makeJob({ id: "wo_tomorrow", scheduledStart: "2026-09-29T05:00:00Z", status: "BOOKED", urgency: "HIGH" })
        ]}
      />
    );
    const text = visibleText(html);

    expect(text).toMatch(/1\s+Work Orders/);
    expect(text).toMatch(/1\s+Active/);
    expect(text).toMatch(/0\s+Completed/);
    expect(text).not.toContain("Urgent");
  });
});

describe("WorkOrderDrawer: activity comes only from the real agent event feed", () => {
  const renderDrawer = (props: { job: WorkOrder; events: AgentEvent[] }) =>
    renderToStaticMarkup(
      <WorkOrderDrawer job={props.job} events={props.events} onClose={() => {}} onQuickAction={() => {}} />
    );

  it("shows an explicit empty state instead of fabricated activity", () => {
    const text = visibleText(renderDrawer({ job: makeJob({}), events: [] }));

    expect(text).toContain("No recorded activity for this work order.");
    expect(text).not.toContain("Customer identified & zone mapped");
    expect(text).not.toContain("Zone verified as");
    expect(text).not.toContain("Technician slot reserved");
    expect(text).not.toContain("Committed via n8n automation");
  });

  it("renders matching work-order events and ignores unrelated ones", () => {
    const text = visibleText(
      renderDrawer({
        job: makeJob({ id: "wo_1001" }),
        events: [
          makeEvent({
            id: "evt_1",
            type: "WORK_ORDER_RESCHEDULED",
            payload: { id: "wo_1001" },
            message: "MATCHING-EVENT"
          }),
          makeEvent({
            id: "evt_2",
            type: "TOOL_CALL_STARTED",
            toolName: "reschedule_work_order",
            payload: { workOrderId: "wo_1001" }
          }),
          makeEvent({
            id: "evt_3",
            type: "WORK_ORDER_CANCELLED",
            payload: { id: "wo_9999" },
            message: "OTHER-EVENT"
          })
        ]
      })
    );

    expect(text).toContain("MATCHING-EVENT");
    expect(text).toContain("Work order rescheduled");
    expect(text).toContain("Executing reschedule_work_order");
    expect(text).not.toContain("OTHER-EVENT");
    expect(text).not.toContain("Work order cancelled");
  });

  it("never invents technician or property details for unknown identifiers", () => {
    const text = visibleText(
      renderDrawer({ job: makeJob({ technicianId: "tech_99", propertyId: "prop_999" }), events: [] })
    );

    expect(text).toContain("tech_99");
    expect(text).toContain("prop_999");
    expect(text).not.toContain("Unassigned");
    expect(text).not.toContain("Austin-Central");
  });
});

describe("Navbar: no unbacked connectivity claims", () => {
  it("does not hardcode connectivity status or a fake outage control", () => {
    const text = visibleText(
      renderToStaticMarkup(<Navbar onReset={() => {}} austinTime="09:00:00 CDT" onOpenVoiceModal={() => {}} />)
    );

    expect(text).not.toContain("Agent connected");
    expect(text).not.toContain("Agent Disconnected");
    expect(text).not.toContain("Local DispatchAgent");
    expect(text).not.toContain("n8n Automation");
    expect(text).not.toContain("Max 3 Retries");
    expect(text).not.toContain("Simulate Outage");

    expect(text).toContain("DispatchAI");
    expect(text).toContain("09:00:00 CDT");
    expect(text).toContain("Voice Dispatcher");
    expect(text).toContain("Reset Demo");
  });
});

describe("AgentChat: the engine badge reflects measured polling state", () => {
  const idleState: AgentState = {
    sessionId: "austin_dispatch_web_session",
    customer: null,
    selectedProperty: null,
    serviceType: null,
    issueSummary: null,
    urgency: "STANDARD",
    queriedDate: null,
    availableSlots: [],
    selectedSlot: null,
    pendingAction: null,
    activeWorkOrder: null,
    history: [],
    events: []
  };

  const renderChat = (connected: boolean | null) =>
    renderToStaticMarkup(
      <AgentChat
        state={idleState}
        notifications={[]}
        connected={connected}
        onSendMessage={async () => {}}
        onConfirm={async () => {}}
        onReject={() => {}}
        isLoading={false}
        activeTab="chat"
        onTabChange={() => {}}
      />
    );

  it("does not claim the dispatch engine is connected when polling fails", () => {
    const text = visibleText(renderChat(false));

    expect(text).not.toContain("Connected");
    expect(text).toContain("Dispatch Agent Unreachable");
  });

  it("only reports connected after a successful poll", () => {
    const text = visibleText(renderChat(true));

    expect(text).toContain("Austin Dispatch Engine Connected");
  });
});
