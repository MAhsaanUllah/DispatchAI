import { afterEach, describe, expect, it } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";
import { addressMatches, nameMatches } from "./verify.js";

// Security Finding 1: a phone number (or spoofed caller ID) must never reveal another customer's details.
const setup = () => {
  const service = new DispatchService();
  const agent = new DispatchAgent(`verify_${Math.random()}`, new N8nClient({ directService: service }));
  const handoffs: string[] = [];
  agent.subscribe((event) => { if (event.type === "HANDOFF_REQUESTED") handoffs.push(event.payload?.text ?? ""); });
  return { service, agent, handoffs };
};
// Everything stored about Alicia (cust_101) that must not leak before she is verified.
const ALICIA_PII = /Alicia|Ramirez|Congress|1402|wo_1001|warm air/i;

afterEach(() => { delete process.env.BUSINESS_TEMPLATE; });

describe("matching what the caller says", () => {
  it("accepts the address in other words, case or with extra words", () => {
    expect(addressMatches("1402 south congress avenue, Austin", "1402 South Congress Ave")).toBe(true);
    expect(addressMatches("it's 1402 S. Congress Ave", "1402 South Congress Ave")).toBe(true);
    expect(addressMatches("South Congress Ave", "1402 South Congress Ave")).toBe(false); // house number missing
    expect(addressMatches("1403 South Congress Ave", "1402 South Congress Ave")).toBe(false);
  });
  it("needs first and last name", () => {
    expect(nameMatches("this is jordan lee", "Jordan", "Lee")).toBe(true);
    expect(nameMatches("Jordan", "Jordan", "Lee")).toBe(false);
  });
});

describe("caller verification", () => {
  it("a wrong address leaks nothing and books nothing", async () => {
    const { agent, service } = setup();
    const replies = [await agent.processMessage("5125550101"), await agent.processMessage("99 Fake Street")];
    replies.push(await agent.processMessage("Show me work order wo_1001"));
    replies.push(await agent.processMessage("Please cancel wo_1001"));
    for (const reply of replies) expect(reply).not.toMatch(ALICIA_PII);
    expect(agent.getState().customer).toBeNull();
    expect(agent.getState().pendingAction).toBeNull();
    expect(service.getStore().workOrders.get("wo_1001")?.status).not.toBe("CANCELLED");
  });

  it("gives the same answers for an unknown number as for a wrong address", async () => {
    const known = setup().agent;
    const unknown = setup().agent;
    expect(await unknown.processMessage("5129998888")).toBe(await known.processMessage("5125550101"));
    expect(await unknown.processMessage("1402 South Congress Ave")).toBe(await known.processMessage("1 Wrong Road"));
  });

  it("hands off after two failed attempts instead of allowing endless guessing", async () => {
    const { agent, handoffs } = setup();
    await agent.processMessage("5125550101");
    await agent.processMessage("1 Wrong Road");
    expect(await agent.processMessage("2 Wrong Road")).toMatch(/team member will call you back/);
    expect(handoffs).toContain("Caller could not be verified");
    expect(agent.getState().customer).toBeNull();
  });

  it("refuses the 6th phone lookup in one conversation", async () => {
    const { agent, handoffs } = setup();
    for (let i = 0; i < 5; i++) {
      expect(await agent.processMessage(`51255501${String(10 + i)}`)).toMatch(/service address/);
      await agent.processMessage("new caller? no"); // keep the conversation moving
    }
    expect(await agent.processMessage("5125550101")).toMatch(/cannot look up any more numbers/);
    expect(handoffs.some((h) => /Too many/.test(h))).toBe(true);
  });

  it("reschedule and cancel need verification and only work on the caller's own booking", async () => {
    const { agent } = setup();
    expect(await agent.processMessage("Please reschedule wo_1001")).toMatch(/need to check it is you/);
    expect(await agent.processMessage("Cancel wo_1001")).toMatch(/need to check it is you/);
    expect(agent.getState().pendingAction).toBeNull();

    await agent.processMessage("5125550101");
    expect(await agent.processMessage("1402 South Congress Ave")).toMatch(/Alicia, you are verified/);
    // wo_1002 belongs to another customer: same answer as a booking that does not exist.
    expect(await agent.processMessage("Cancel wo_1002")).toBe("I could not find work order #wo_1002 on your account. Please check the number.");
    expect(agent.getState().pendingAction).toBeNull();
    expect(await agent.processMessage("Cancel wo_1001")).toMatch(/Are you sure you want to cancel Work Order #wo_1001/);
  });

  it("will not create a second account on a number that already has one", async () => {
    const { agent, handoffs, service } = setup();
    await agent.processMessage("5125550101");
    expect(await agent.processMessage("new")).toMatch(/team member will call you back/);
    expect(handoffs).toContain("Caller asked for a new account on a number that already has one");
    expect([...service.getStore().customers.values()].filter((c) => c.phone === "5125550101")).toHaveLength(1);
  });

  it("instore businesses verify by full name", async () => {
    process.env.BUSINESS_TEMPLATE = "salon";
    const { agent } = setup();
    expect(await agent.processMessage("5555550901")).toMatch(/full name/);
    expect(await agent.processMessage("Jordan")).not.toMatch(/Jordan|Lee/);
    expect(await agent.processMessage("Jordan Lee")).toMatch(/Jordan, you are verified/);
  });
});
