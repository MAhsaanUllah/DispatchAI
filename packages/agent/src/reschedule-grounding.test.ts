import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { AgentEvent } from "@dispatchai/shared";
import { DispatchAgent, serviceDate } from "./agent.js";
import { N8nClient } from "./client.js";

describe("P0-2: Reschedule constraint grounding", () => {
  let domainService: DispatchService;
  let n8nClient: N8nClient;
  let agent: DispatchAgent;
  let emittedEvents: AgentEvent[];

  const availabilityQueries = () =>
    emittedEvents
      .filter((e) => e.type === "TOOL_CALL_STARTED" && e.toolName === "check_availability")
      .map((e) => e.payload as { serviceType: string; serviceZone: string; date: string });

  beforeEach(() => {
    domainService = new DispatchService();
    n8nClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService
    });
    agent = new DispatchAgent("p0_2_session", n8nClient);
    emittedEvents = [];
    agent.subscribe((event) => emittedEvents.push(event));
  });

  it("queries the work order's own property zone instead of a hardcoded zone", async () => {
    await agent.processMessage("5125550103"); // Maya Lin -> prop_203 (Austin-Central)

    const wo = domainService.getStore().workOrders.get("wo_1002")!;
    const property = domainService.getStore().properties.get(wo.propertyId)!;
    expect(property.serviceZone).not.toBe("Austin-South");

    const reply = await agent.processMessage("Please reschedule wo_1002");

    const queries = availabilityQueries();
    expect(queries.length).toBeGreaterThan(0);
    const query = queries[queries.length - 1];
    expect(query.serviceZone).toBe(property.serviceZone);
    expect(query.serviceZone).not.toBe("Austin-South");
    expect(query.date).toBe(serviceDate(1));
    expect(reply).toContain(property.serviceZone);
  });

  it("uses today as the query date when the user says today", async () => {
    await agent.processMessage("5125550101");

    const reply = await agent.processMessage("Please reschedule wo_1001 for today");

    const query = availabilityQueries()[0];
    expect(query.date).toBe(serviceDate());
    expect(reply).toContain(serviceDate());
    expect(reply).not.toContain("tomorrow");
  });

  it("uses tomorrow as the query date when the user says tomorrow", async () => {
    await agent.processMessage("5125550101");

    const reply = await agent.processMessage("Please reschedule wo_1001 for tomorrow");

    const query = availabilityQueries()[0];
    expect(query.date).toBe(serviceDate(1));
    expect(reply).toContain(serviceDate(1));
  });

  it("respects an explicitly stated date verbatim and never claims tomorrow", async () => {
    await agent.processMessage("5125550101");

    const reply = await agent.processMessage("Please reschedule wo_1001 to 2026-10-05");

    const query = availabilityQueries()[0];
    expect(query.date).toBe("2026-10-05");
    expect(reply).toContain("2026-10-05");
    expect(reply).not.toContain("tomorrow");
  });

  it("does not reuse a stale pending reschedule after a date constraint change", async () => {
    await agent.processMessage("5125550101");
    await agent.processMessage("AC broken");

    const slot = agent.getState().availableSlots[0];
    agent.proposeReschedule("wo_1001", slot.slotId);
    expect(agent.getState().pendingAction?.type).toBe("RESCHEDULE_WORK_ORDER");

    await agent.processMessage("Actually check tomorrow instead");

    expect(agent.getState().pendingAction).toBeNull();
    expect(agent.getState().queriedDate).toBe(serviceDate(1));
    expect(emittedEvents.some((e) => e.type === "WORK_ORDER_RESCHEDULED")).toBe(false);
    expect(domainService.getStore().workOrders.get("wo_1001")?.scheduledStart).toBe(
      "2026-09-18T08:00:00Z"
    );
  });

  it("asks for clarification instead of inventing a zone when no property is known", async () => {
    const reply = await agent.processMessage("Please reschedule wo_1001");

    expect(availabilityQueries().length).toBe(0);
    expect(reply.toLowerCase()).toMatch(/phone|address|service area/);
    expect(reply).not.toContain("Austin-South");
  });

  it("does not silently substitute a zone when the identified property is not the work order's property", async () => {
    await agent.processMessage("5125550101"); // Alicia -> prop_201

    const wo = domainService.getStore().workOrders.get("wo_1002")!;
    expect(wo.propertyId).toBe("prop_203");

    const reply = await agent.processMessage("Please reschedule wo_1002");

    expect(availabilityQueries().length).toBe(0);
    expect(reply).not.toContain("Austin-South");
    expect(reply).not.toContain("Austin-Central");
  });

  it("reports a backend outage during reschedule instead of a false not-found", async () => {
    const offlineClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      request: async (): Promise<Response> => {
        throw new Error("ECONNREFUSED connect ECONNREFUSED 127.0.0.1:5678");
      }
    });
    const offlineAgent = new DispatchAgent("p0_2_offline", offlineClient);

    const reply = await offlineAgent.processMessage("Please reschedule wo_1001");

    expect(reply).not.toContain("could not find");
    expect(reply.toLowerCase()).toContain("unavailable");
  });

  it("still reports a true work-order not-found during reschedule", async () => {
    await agent.processMessage("5125550101");

    const reply = await agent.processMessage("Please reschedule wo_9999");

    expect(reply).toContain("could not find work order");
    expect(availabilityQueries().length).toBe(0);
  });

  it("asks for the property instead of assuming a zone on an unqualified service request", async () => {
    const reply = await agent.processMessage("My AC is blowing hot air");

    expect(availabilityQueries().length).toBe(0);
    expect(reply.toLowerCase()).toMatch(/phone|address|service area/);
    expect(reply).not.toContain("Austin-South");
    expect(reply).not.toContain("Austin-Central");
  });

  it("asks for the property instead of assuming a zone on an unqualified date change", async () => {
    const reply = await agent.processMessage("Actually check tomorrow instead");

    expect(availabilityQueries().length).toBe(0);
    expect(reply.toLowerCase()).toMatch(/phone|address|service area/);
    expect(reply).not.toContain("Austin-South");
    expect(reply).not.toContain("Austin-Central");
  });
});
