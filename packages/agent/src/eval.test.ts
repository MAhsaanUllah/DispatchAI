import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { AgentEvent } from "@dispatchai/shared";
import { DispatchAgent, serviceDate } from "./agent.js";
import { N8nClient } from "./client.js";

describe("Phase 9: Automated Agent Scenario Evaluation Benchmarks", () => {
  let domainService: DispatchService;
  let n8nClient: N8nClient;
  let agent: DispatchAgent;
  let emittedEvents: AgentEvent[];

  beforeEach(() => {
    domainService = new DispatchService();
    n8nClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService
    });
    agent = new DispatchAgent("eval_session_909", n8nClient);
    emittedEvents = [];
    agent.subscribe((evt) => emittedEvents.push(evt));
  });

  it("Benchmark 1: Complete end-to-end customer identification and grounded booking", async () => {
    // Step 1: Customer identification
    const r1 = await agent.processMessage("My phone number is 512-555-0101");
    expect(r1).toContain("Alicia Ramirez");
    expect(agent.getState().customer?.firstName).toBe("Alicia");

    // Step 2: Issue report & availability query
    const r2 = await agent.processMessage("AC blowing warm air");
    expect(r2).toContain("HVAC");
    expect(agent.getState().availableSlots.length).toBeGreaterThan(0);

    // Step 3: Slot proposal
    const slot = agent.getState().availableSlots[0];
    const r3 = await agent.processMessage(`Book slot ${slot.slotId}`);
    expect(r3).toContain("Would you like me to confirm");
    expect(agent.getState().pendingAction).not.toBeNull();

    // Step 4: Affirmative confirmation
    const r4 = await agent.processMessage("Yes, please confirm");
    expect(r4).toContain("confirmed");
    expect(agent.getState().activeWorkOrder?.status).toBe("BOOKED");

    // Event sequence validation
    expect(emittedEvents.some((e) => e.type === "TOOL_CALL_STARTED" && e.toolName === "find_customer")).toBe(true);
    expect(emittedEvents.some((e) => e.type === "TOOL_CALL_STARTED" && e.toolName === "check_availability")).toBe(true);
    expect(emittedEvents.some((e) => e.type === "CONFIRMATION_REQUIRED")).toBe(true);
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_CREATED")).toBe(true);
  });

  it("Benchmark 2: Interruption handling and date constraint shift evaluation", async () => {
    await agent.processMessage("5125550101");
    await agent.processMessage("Need HVAC repair");
    expect(agent.getState().queriedDate).toBe(serviceDate());

    // Interruption
    const r = await agent.processMessage("Actually check tomorrow instead");
    expect(r).toContain(serviceDate(1));
    expect(agent.getState().queriedDate).toBe(serviceDate(1));
    expect(agent.getState().availableSlots.every((s) => s.startAt.startsWith(serviceDate(1)))).toBe(true);
  });

  it("Benchmark 3: Multi-turn work order rescheduling evaluation", async () => {
    // Query availability for tomorrow
    const avail = await agent.checkAvailability("HVAC", "Austin-South", "2026-09-19");
    if (!avail.ok) throw new Error(avail.error.message);
    const targetSlot = avail.data.slots[0];

    // Propose reschedule
    const action = agent.proposeReschedule("wo_1001", targetSlot.slotId);
    expect(action.payload.workOrderId).toBe("wo_1001");

    // Confirm reschedule
    const res = await agent.confirmPendingAction();
    expect((res as any).ok).toBe(true);
    expect(domainService.getStore().workOrders.get("wo_1001")?.scheduledStart).toBe(targetSlot.startAt);
  });

  it("Benchmark 4: Work order cancellation and slot release evaluation", async () => {
    agent.proposeCancellation("wo_1002", "Customer moving out");
    expect(agent.getState().pendingAction?.type).toBe("CANCEL_WORK_ORDER");

    const confirmRes = await agent.confirmPendingAction();
    expect((confirmRes as any).ok).toBe(true);
    expect(domainService.getStore().workOrders.get("wo_1002")?.status).toBe("CANCELLED");
  });

  it("Benchmark 5: State coherence and event trace integrity", async () => {
    await agent.processMessage("5125550101");
    const state = agent.getState();
    expect(state.events.length).toBeGreaterThan(0);

    for (const evt of state.events) {
      expect(evt.id).toBeDefined();
      expect(evt.timestamp).toBeDefined();
      expect(evt.correlationId).toBeDefined();
    }
  });
});
