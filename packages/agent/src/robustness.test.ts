import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { AgentEvent } from "@dispatchai/shared";
import { DispatchAgent, serviceDate } from "./agent.js";
import { N8nClient } from "./client.js";

describe("Phase 6: Interaction Robustness Test Suite", () => {
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
    agent = new DispatchAgent("robustness_session_606", n8nClient);
    emittedEvents = [];
    agent.subscribe((event) => emittedEvents.push(event));
  });

  it("Scenario 1: Reschedule proposal requires affirmative confirmation before mutation", async () => {
    // Check availability for tomorrow to pick a new slot
    const avail = await agent.checkAvailability("HVAC", "Austin-South", "2026-09-19");
    if (!avail.ok) throw new Error(avail.error.message);
    const targetSlot = avail.data.slots[0];
    expect(targetSlot).toBeDefined();

    // 1. Propose reschedule for wo_1001 to targetSlot.slotId
    const action = agent.proposeReschedule("wo_1001", targetSlot.slotId);
    expect(action.type).toBe("RESCHEDULE_WORK_ORDER");

    const stateBefore = agent.getState();
    expect(stateBefore.pendingAction).not.toBeNull();
    // Verify work order in store is not updated yet
    const woStoreBefore = domainService.getStore().workOrders.get("wo_1001");
    expect(woStoreBefore?.scheduledStart).not.toBe(targetSlot.startAt);

    // 2. User confirms
    const reply = await agent.processMessage("Yes, confirm the reschedule");
    expect(reply).toContain("confirmed");

    const stateAfter = agent.getState();
    expect(stateAfter.pendingAction).toBeNull();
    expect(stateAfter.activeWorkOrder?.id).toBe("wo_1001");
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_RESCHEDULED")).toBe(true);
  });

  it("Scenario 2: Cancellation proposal requires affirmative confirmation before mutation", async () => {
    // 1. Propose cancellation for wo_1002 (seeded status: DISPATCHED)
    const action = agent.proposeCancellation("wo_1002", "Customer requested cancellation");
    expect(action.type).toBe("CANCEL_WORK_ORDER");

    expect(agent.getState().pendingAction).not.toBeNull();
    const woBefore = domainService.getStore().workOrders.get("wo_1002");
    expect(woBefore?.status).toBe("DISPATCHED");

    // 2. User confirms cancellation
    const reply = await agent.processMessage("Yes, proceed with cancellation");
    expect(reply).toContain("confirmed");

    const woAfter = domainService.getStore().workOrders.get("wo_1002");
    expect(woAfter?.status).toBe("CANCELLED");
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_CANCELLED")).toBe(true);
  });

  it("Scenario 3: Interruption clears pending unconfirmed mutation and refreshes slots", async () => {
    await agent.processMessage("5125550101");
    await agent.processMessage("AC broken");
    const firstSlot = agent.getState().availableSlots[0];
    agent.proposeBooking(firstSlot.slotId, "AC issue");

    expect(agent.getState().pendingAction).not.toBeNull();

    // Customer interrupts with changed date constraint: "Actually check tomorrow instead"
    const reply = await agent.processMessage("Actually check tomorrow instead");
    expect(reply).toContain(serviceDate(1));

    // Pending action MUST be cleared, not executed!
    expect(agent.getState().pendingAction).toBeNull();
    expect(agent.getState().activeWorkOrder).toBeNull();
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_CREATED")).toBe(false);
  });

  it("Scenario 4: Rejection discards pending cancellation cleanly without modifying DB", async () => {
    // wo_1003 seeded status is BOOKED
    agent.proposeCancellation("wo_1003", "Test cancel");
    expect(agent.getState().pendingAction).not.toBeNull();

    // User rejects
    const reply = await agent.processMessage("No, keep the appointment");
    expect(reply).toContain("cancelled that proposed action");

    expect(agent.getState().pendingAction).toBeNull();
    const wo = domainService.getStore().workOrders.get("wo_1003");
    expect(wo?.status).toBe("BOOKED"); // Unchanged
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_CANCELLED")).toBe(false);
  });

  it("does not confirm a stale action when affirmation also changes the date", async () => {
    await agent.processMessage("5125550101");
    await agent.processMessage("AC broken");
    agent.proposeBooking(agent.getState().availableSlots[0].slotId, "AC issue");

    await agent.processMessage("Yes, but actually check tomorrow instead");

    expect(agent.getState().pendingAction).toBeNull();
    expect(agent.getState().activeWorkOrder).toBeNull();
    expect(agent.getState().queriedDate).toBe(serviceDate(1));
  });
});
