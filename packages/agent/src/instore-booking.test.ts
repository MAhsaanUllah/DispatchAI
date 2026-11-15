import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";

describe("instore booking (salon template)", () => {
  beforeEach(() => {
    process.env.BUSINESS_TEMPLATE = "salon";
  });
  afterEach(() => {
    delete process.env.BUSINESS_TEMPLATE;
  });

  it("books a haircut at the salon by chat without any customer address", async () => {
    const service = new DispatchService();
    const agent = new DispatchAgent("salon_chat", new N8nClient({ directService: service }));

    await agent.processMessage("5555550901");
    await agent.processMessage("Jordan Lee");
    expect(agent.getState().customer?.id).toBe("cust_901");
    expect(agent.getState().selectedProperty ?? null).toBeNull();

    const offer = await agent.processMessage("I need a haircut tomorrow");
    expect(offer).toContain("Main Street Studio");
    const slot = agent.getState().availableSlots[0];
    expect(slot).toBeDefined();

    const proposal = await agent.processMessage(`Please book ${slot.slotId}`);
    expect(proposal).toContain("Main Street Studio");
    await agent.processMessage("yes");

    const booked = agent.getState().activeWorkOrder;
    expect(booked?.serviceType).toBe("HAIRCUT");
    expect(booked?.propertyId).toBeUndefined();
    expect(booked?.id).toBe("wo_1001");
  });
});
