import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { AgentEvent } from "@dispatchai/shared";
import { DispatchAgent, serviceDate } from "./agent.js";
import { N8nClient } from "./client.js";

interface AvailabilityQuery {
  serviceType: string;
  serviceZone: string;
  date: string;
}

describe("Work-order routing correctness", () => {
  let domainService: DispatchService;
  let agent: DispatchAgent;
  let emittedEvents: AgentEvent[];

  const toolCalls = (toolName: string) =>
    emittedEvents.filter((e) => e.type === "TOOL_CALL_STARTED" && e.toolName === toolName);
  const availabilityQueries = () =>
    toolCalls("check_availability").map((e) => e.payload as AvailabilityQuery);
  const resetEvents = () => {
    emittedEvents.length = 0;
  };

  async function bookNewWorkOrder(): Promise<{ id: string; reply: string }> {
    await agent.processMessage("5125550101");
    await agent.processMessage("My AC is blowing warm air, can you send someone tomorrow?");
    const slot = agent.getState().availableSlots[0];
    expect(slot).toBeDefined();
    await agent.processMessage(`Please book ${slot.slotId}`);
    const reply = await agent.processMessage("yes");
    const id = agent.getState().activeWorkOrder?.id;
    expect(id).toBeTruthy();
    return { id: id as string, reply };
  }

  beforeEach(() => {
    domainService = new DispatchService();
    const n8nClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService
    });
    agent = new DispatchAgent("routing_session", n8nClient);
    emittedEvents = [];
    agent.subscribe((event) => emittedEvents.push(event));
  });

  describe("Defect 1: explicit work-order ids take precedence over phone detection", () => {
    it("routes a wo_ id with a long numeric sequence to get_work_order, not find_customer", async () => {
      await agent.processMessage("5125550101");
      resetEvents();

      const reply = await agent.processMessage("Show work order wo_1790592271336");

      expect(toolCalls("get_work_order")).toHaveLength(1);
      expect(toolCalls("find_customer")).toHaveLength(0);
      expect(reply).not.toMatch(/phone number/i);
      expect(reply).toContain("wo_1790592271336");
      expect(agent.getState().customer?.id).toBe("cust_101");
    });

    it("still performs a normal phone-number lookup", async () => {
      const reply = await agent.processMessage("Hi, my number is 5125550101");

      expect(toolCalls("find_customer")).toHaveLength(1);
      expect(reply).toContain("Alicia");
      expect(agent.getState().customer?.id).toBe("cust_101");
    });

    it("keeps valid session context when an unrelated work-order lookup fails", async () => {
      const { id } = await bookNewWorkOrder();

      const reply = await agent.processMessage("Show work order wo_9999999");

      expect(reply).toContain("could not find work order");
      expect(agent.getState().customer?.id).toBe("cust_101");
      expect(agent.getState().selectedProperty?.id).toBe("prop_201");
      expect(agent.getState().activeWorkOrder?.id).toBe(id);
    });

    it("keeps valid session context when a phone lookup finds nothing", async () => {
      await agent.processMessage("5125550101");

      const reply = await agent.processMessage("Try 9998887777 instead");

      expect(reply).toContain("could not find an existing customer");
      expect(agent.getState().customer?.id).toBe("cust_101");
      expect(agent.getState().selectedProperty?.id).toBe("prop_201");
    });
  });

  describe("Defect 2: a grounded reschedule never falls back into booking", () => {
    it("completes create -> show -> reschedule -> slot -> confirm on the same work order", async () => {
      const { id: createdId } = await bookNewWorkOrder();
      const workOrdersBefore = domainService.getStore().workOrders.size;
      resetEvents();

      const show = await agent.processMessage("Show me the work order we just created");
      expect(show).toContain(createdId);

      const grounded = await agent.processMessage("Reschedule this work order to tomorrow");
      const slots = agent.getState().availableSlots;
      expect(slots.length).toBeGreaterThan(0);
      const target = slots[0];
      expect(grounded).toContain(target.slotId);

      const proposed = await agent.processMessage(`I'll take ${target.slotId}`);
      const pending = agent.getState().pendingAction;
      expect(pending?.type).toBe("RESCHEDULE_WORK_ORDER");
      expect(pending?.payload.workOrderId).toBe(createdId);
      expect(proposed).toMatch(/reschedul/i);
      expect(
        emittedEvents.filter((e) => e.type === "CONFIRMATION_REQUIRED").at(-1)?.toolName
      ).toBe("reschedule_work_order");

      const confirmed = await agent.processMessage("yes");
      expect(confirmed).toMatch(/rescheduled/i);
      expect(agent.getState().activeWorkOrder?.id).toBe(createdId);
      expect(agent.getState().activeWorkOrder?.scheduledStart).toBe(target.startAt);
      expect(agent.getState().pendingAction).toBeNull();
      expect(domainService.getStore().workOrders.size).toBe(workOrdersBefore);
      expect(emittedEvents.some((e) => e.type === "WORK_ORDER_RESCHEDULED")).toBe(true);
      expect(emittedEvents.some((e) => e.type === "WORK_ORDER_CREATED")).toBe(false);
    });

    it("keeps the reschedule intent when the date changes mid-flow", async () => {
      const { id: createdId } = await bookNewWorkOrder();
      resetEvents();

      await agent.processMessage("Reschedule this work order to tomorrow");
      const reply = await agent.processMessage("Check tomorrow instead");

      const lastQuery = availabilityQueries().at(-1);
      expect(lastQuery).toMatchObject({ serviceZone: "Austin-South", date: serviceDate(1) });
      expect(reply).toContain(createdId);
      expect(reply).not.toMatch(/\bbook\b/i);

      const target = agent.getState().availableSlots[0];
      expect(target).toBeDefined();
      await agent.processMessage(`I'll take ${target.slotId}`);
      expect(agent.getState().pendingAction?.type).toBe("RESCHEDULE_WORK_ORDER");
      expect(agent.getState().pendingAction?.payload.workOrderId).toBe(createdId);
    });
  });

  describe("Defect 3: confirmation wording matches the completed action", () => {
    it("reports a create as booked", async () => {
      const { id, reply } = await bookNewWorkOrder();

      expect(reply).toMatch(/booked/i);
      expect(reply).toContain(id);
      expect(reply).not.toMatch(/reschedul|cancel/i);
    });

    it("reports a reschedule with its new schedule", async () => {
      const { id } = await bookNewWorkOrder();
      resetEvents();

      await agent.processMessage("Reschedule this work order to tomorrow");
      const target = agent.getState().availableSlots[0];
      await agent.processMessage(`I'll take ${target.slotId}`);
      const reply = await agent.processMessage("yes");

      expect(reply).toMatch(/rescheduled/i);
      expect(reply).toContain(id);
      expect(reply).toContain(target.startAt);
      expect(reply).not.toMatch(/\bbooked\b/i);
      expect(reply).not.toMatch(/cancel/i);
    });

    it("reports a cancellation as cancelled, never as booked", async () => {
      const { id } = await bookNewWorkOrder();

      const proposal = await agent.processMessage("Cancel that work order");
      expect(proposal).toMatch(/cancel/i);

      const reply = await agent.processMessage("yes");
      expect(reply).toMatch(/cancelled/i);
      expect(reply).toContain(id);
      expect(reply).not.toMatch(/\bbooked\b|appointment|technician/i);
      expect(domainService.getStore().workOrders.get(id)?.status).toBe("CANCELLED");
    });
  });

  describe("Defect 4: anaphoric work-order references resolve only when unambiguous", () => {
    it("resolves 'the work order we just created' to the freshly created order", async () => {
      const { id: createdId } = await bookNewWorkOrder();
      resetEvents();

      const reply = await agent.processMessage("Show me the work order we just created");

      expect(reply).toContain(createdId);
      expect(toolCalls("get_work_order").map((e) => (e.payload as any).workOrderId)).toEqual([
        createdId
      ]);
    });

    it("resolves 'the work order' when exactly one reference exists", async () => {
      await agent.processMessage("5125550101");
      await agent.processMessage("Show work order wo_1001");
      resetEvents();

      const reply = await agent.processMessage("Please reschedule the work order to tomorrow");

      const lastQuery = availabilityQueries().at(-1);
      expect(lastQuery).toMatchObject({ serviceZone: "Austin-South", date: serviceDate(1) });
      expect(reply).toContain("wo_1001");
    });

    it("resolves reschedule 'it' when exactly one reference exists", async () => {
      await agent.processMessage("5125550101");
      await agent.processMessage("Show work order wo_1001");
      resetEvents();

      const reply = await agent.processMessage("Please reschedule it to tomorrow");

      expect(reply).toContain("wo_1001");
      expect(availabilityQueries()).toHaveLength(1);
    });

    it("asks for the work-order number instead of guessing between two references", async () => {
      const { id: createdId } = await bookNewWorkOrder();
      await agent.processMessage("Show work order wo_1002");
      resetEvents();

      const reply = await agent.processMessage("Please reschedule this work order to tomorrow");

      expect(reply.toLowerCase()).toMatch(/work order number/);
      expect(availabilityQueries()).toHaveLength(0);
      expect(agent.getState().pendingAction).toBeNull();
      expect(createdId).toBeTruthy();
    });
  });
});
