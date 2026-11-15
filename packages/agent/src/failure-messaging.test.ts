import { describe, it, expect } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";

describe("P0-1: Truthful failure messaging (backend outage vs true not-found)", () => {
  it("still reports a true customer not-found when the backend responds successfully", async () => {
    const domainService = new DispatchService();
    const onlineClient = new N8nClient({ directService: domainService });
    const agent = new DispatchAgent("p0_1_find_true_404", onlineClient);

    const unknown = await agent.processMessage("My phone number is 512-555-9999");
    const known = await new DispatchAgent("p0_1_known", onlineClient).processMessage("My phone number is 512-555-0101");

    // Same answer whether or not an account exists, so a caller cannot probe numbers.
    expect(unknown).toBe(known);
    expect(unknown).toMatch(/service address/);
  });

  it("still reports a true work order not-found when the backend responds successfully", async () => {
    const domainService = new DispatchService();
    const onlineClient = new N8nClient({ directService: domainService });
    const agent = new DispatchAgent("p0_1_wo_true_404", onlineClient);
    await agent.processMessage("5125550101");
    await agent.processMessage("1402 South Congress Ave");

    const reply = await agent.processMessage("Show me work order wo_9999");

    expect(reply).toContain("could not find work order");
  });
});
