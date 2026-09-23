import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { AgentEvent } from "@dispatchai/shared";
import { DispatchAgent, serviceDate } from "./agent.js";
import { N8nClient } from "./client.js";

describe("Phase 3: Cloudflare DispatchAgent & Text Interaction Path", () => {
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
    agent = new DispatchAgent("test_session_101", n8nClient);
    emittedEvents = [];
    agent.subscribe((event) => emittedEvents.push(event));
  });

  it("Scenario 1: Customer identification via phone lookup", async () => {
    const reply = await agent.processMessage("Hi, my phone number is 512-555-0101");

    expect(reply).toContain("Alicia Ramirez");
    expect(reply).toContain("1402 South Congress Ave");

    const state = agent.getState();
    expect(state.customer).not.toBeNull();
    expect(state.customer?.firstName).toBe("Alicia");
    expect(state.selectedProperty?.serviceZone).toBe("Austin-South");

    // Events emitted
    expect(emittedEvents.some((e) => e.type === "TOOL_CALL_STARTED" && e.toolName === "find_customer")).toBe(true);
    expect(emittedEvents.some((e) => e.type === "TOOL_CALL_COMPLETED" && e.toolName === "find_customer")).toBe(true);
    expect(emittedEvents.some((e) => e.type === "STATE_UPDATED")).toBe(true);
  });

  it("Scenario 2: Grounded availability query returns only backend slots", async () => {
    // Identify customer first
    await agent.processMessage("5125550101");

    // Ask for availability
    const reply = await agent.processMessage("My AC is blowing hot air and not cooling");

    expect(reply).toContain("HVAC");
    expect(reply).toContain("Austin-South");

    const state = agent.getState();
    expect(state.availableSlots.length).toBeGreaterThan(0);
    // Verified grounding: none of the returned slots can be slot_301 (which is seeded as booked)
    expect(state.availableSlots.some((s) => s.slotId === "slot_301")).toBe(false);

    expect(emittedEvents.some((e) => e.type === "TOOL_CALL_STARTED" && e.toolName === "check_availability")).toBe(true);
    expect(emittedEvents.some((e) => e.type === "TOOL_CALL_COMPLETED" && e.toolName === "check_availability")).toBe(true);
  });

  it("Scenario 3 & 4: Strict confirmation policy - no mutation before affirmative confirmation", async () => {
    await agent.processMessage("5125550101");
    await agent.processMessage("My AC unit stopped working today");

    const stateBefore = agent.getState();
    const targetSlot = stateBefore.availableSlots[0];
    expect(targetSlot).toBeDefined();

    // Select slot
    const slotHour = targetSlot.startAt.split("T")[1].substring(0, 2);
    const reply = await agent.processMessage(`Book slot ${targetSlot.slotId}`);

    expect(reply).toContain("Would you like me to confirm");

    // Verify: Work order is NOT created yet in DB or state
    expect(agent.getState().activeWorkOrder).toBeNull();
    expect(agent.getState().pendingAction).not.toBeNull();
    expect(agent.getState().pendingAction?.type).toBe("CREATE_WORK_ORDER");
    expect(emittedEvents.some((e) => e.type === "CONFIRMATION_REQUIRED")).toBe(true);
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_CREATED")).toBe(false);

    // User confirms affirmatively
    const confirmReply = await agent.processMessage("Yes, please confirm the appointment");

    expect(confirmReply).toContain("I have confirmed your appointment");
    expect(agent.getState().activeWorkOrder).not.toBeNull();
    expect(agent.getState().activeWorkOrder?.status).toBe("BOOKED");
    expect(agent.getState().pendingAction).toBeNull();

    // Verify WORK_ORDER_CREATED event emitted
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_CREATED")).toBe(true);
  });

  it("Scenario 5: Interruption & changed constraint forces re-query and discards stale slots", async () => {
    await agent.processMessage("5125550101");
    await agent.processMessage("AC is broken");

    const initialSlots = agent.getState().availableSlots;
    expect(initialSlots.length).toBeGreaterThan(0);

    // User interrupts: "Actually, check tomorrow instead"
    const reply = await agent.processMessage("Actually, check tomorrow instead");

    expect(reply).toContain(serviceDate(1));
    const newSlots = agent.getState().availableSlots;
    expect(newSlots.length).toBeGreaterThan(0);

    // All slots must now be on tomorrow's date
    for (const slot of newSlots) {
      expect(slot.startAt.startsWith(serviceDate(1))).toBe(true);
    }
  });

  it("Scenario 6: Tool failure is reported accurately without fabricating success", async () => {
    // Attempting to query an invalid non-existent work order
    const reply = await agent.processMessage("Show me work order wo_9999");
    expect(reply).toContain("could not find work order");
    expect(agent.getState().activeWorkOrder).toBeNull();
  });

  it("Scenario 7: Rejection cleanly discards pending mutation without executing tool", async () => {
    await agent.processMessage("5125550101");
    await agent.processMessage("AC needs repair");

    const targetSlot = agent.getState().availableSlots[0];
    await agent.processMessage(`Book slot ${targetSlot.slotId}`);

    expect(agent.getState().pendingAction).not.toBeNull();

    // User rejects
    const rejectReply = await agent.processMessage("No, cancel that");
    expect(rejectReply).toContain("cancelled that proposed action");
    expect(agent.getState().pendingAction).toBeNull();
    expect(agent.getState().activeWorkOrder).toBeNull();
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_CREATED")).toBe(false);
  });
});
