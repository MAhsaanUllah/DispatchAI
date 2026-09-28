import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { AgentEvent } from "@dispatchai/shared";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";

describe("P0-1: Truthful failure messaging (backend outage vs true not-found)", () => {
  let domainService: DispatchService;
  let offlineClient: N8nClient;
  let emittedEvents: AgentEvent[];

  const offlineRequest = async (): Promise<Response> => {
    throw new Error("ECONNREFUSED connect ECONNREFUSED 127.0.0.1:5678");
  };

  beforeEach(() => {
    domainService = new DispatchService();
    offlineClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      request: offlineRequest
    });
    emittedEvents = [];
  });

  it("does not claim 'not found' when find_customer fails because n8n is unavailable", async () => {
    const agent = new DispatchAgent("p0_1_find_offline", offlineClient);
    agent.subscribe((evt) => emittedEvents.push(evt));

    const reply = await agent.processMessage("My phone number is 512-555-0101");

    expect(reply).not.toContain("could not find");
    expect(reply.toLowerCase()).toContain("unavailable");

    const failureEvent = emittedEvents.find(
      (e) => e.type === "TOOL_CALL_FAILED" && e.toolName === "find_customer"
    );
    expect(failureEvent).toBeDefined();
    expect((failureEvent!.payload as any).code).toBe("N8N_COMMUNICATION_ERROR");
    expect((failureEvent!.payload as any).retryable).toBe(true);

    // The user-facing reply must not leak internal transport errors
    expect(reply).not.toContain("ECONNREFUSED");
    expect(reply).not.toContain("Failed to communicate");
  });

  it("does not claim 'not found' when get_work_order fails because n8n is unavailable", async () => {
    const agent = new DispatchAgent("p0_1_wo_offline", offlineClient);
    agent.subscribe((evt) => emittedEvents.push(evt));

    const reply = await agent.processMessage("Show me work order wo_1001");

    expect(reply).not.toContain("could not find");
    expect(reply.toLowerCase()).toContain("unavailable");

    const failureEvent = emittedEvents.find(
      (e) => e.type === "TOOL_CALL_FAILED" && e.toolName === "get_work_order"
    );
    expect(failureEvent).toBeDefined();
    expect((failureEvent!.payload as any).code).toBe("N8N_COMMUNICATION_ERROR");
    expect((failureEvent!.payload as any).retryable).toBe(true);

    expect(reply).not.toContain("ECONNREFUSED");
    expect(reply).not.toContain("Failed to communicate");
  });

  it("still reports a true customer not-found when the backend responds successfully", async () => {
    const onlineClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService
    });
    const agent = new DispatchAgent("p0_1_find_true_404", onlineClient);

    const reply = await agent.processMessage("My phone number is 512-555-9999");

    expect(reply).toContain("could not find an existing customer account");
  });

  it("still reports a true work order not-found when the backend responds successfully", async () => {
    const onlineClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService
    });
    const agent = new DispatchAgent("p0_1_wo_true_404", onlineClient);

    const reply = await agent.processMessage("Show me work order wo_9999");

    expect(reply).toContain("could not find work order");
  });
});
