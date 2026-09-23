import { describe, it, expect, beforeEach, vi } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { AgentEvent } from "@dispatchai/shared";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";
import { handleRequest } from "./worker.js";

describe("Phase 5: ElevenLabs Voice Integration & Tool Bridge", () => {
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
    agent = new DispatchAgent("voice_session_505", n8nClient);
    emittedEvents = [];
    agent.subscribe((event) => emittedEvents.push(event));
  });

  it("Scenario 1: Rejects a voice session when ElevenLabs is not configured", async () => {
    const req = new Request("http://localhost/api/voice/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": "voice_session_505" },
      body: JSON.stringify({ conversationId: "conv_el_test_123" })
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(503);

    const body: any = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VOICE_NOT_CONFIGURED");
  });

  it("Scenario 2: ElevenLabs tool bridge executes find_customer and check_availability", async () => {
    // 1. Voice tool call: find_customer
    const req1 = new Request("http://localhost/api/voice/tools/find_customer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": "voice_session_505",
        "x-dispatch-secret": "dev_secret_dispatch_2026"
      },
      body: JSON.stringify({
        conversation_id: "conv_el_test_123",
        phone: "5125550101"
      })
    });

    const res1 = await handleRequest(req1);
    expect(res1.status).toBe(200);
    const body1: any = await res1.json();
    expect(body1.result.customer.firstName).toBe("Alicia");
    expect(body1.result.properties[0].serviceZone).toBe("Austin-South");

    // 2. Voice tool call: check_availability
    const req2 = new Request("http://localhost/api/voice/tools/check_availability", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": "voice_session_505",
        "x-dispatch-secret": "dev_secret_dispatch_2026"
      },
      body: JSON.stringify({
        conversation_id: "conv_el_test_123",
        serviceType: "HVAC",
        serviceZone: "Austin-South",
        date: "2026-09-18"
      })
    });

    const res2 = await handleRequest(req2);
    expect(res2.status).toBe(200);
    const body2: any = await res2.json();
    expect(body2.result.slots.length).toBeGreaterThan(0);
    // Grounding verification: booked slot_301 is omitted
    expect(body2.result.slots.some((s: any) => s.slotId === "slot_301")).toBe(false);
  });

  it("Scenario 3: Voice booking requires confirmation before work order mutation", async () => {
    // 1. Identify customer via HTTP voice tool
    await handleRequest(new Request("http://localhost/api/voice/tools/find_customer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": "voice_session_505", "x-dispatch-secret": "dev_secret_dispatch_2026" },
      body: JSON.stringify({ conversation_id: "conv_el_test_123", phone: "5125550101" })
    }));

    // 2. Query availability via HTTP voice tool for tomorrow
    const availRes = await handleRequest(new Request("http://localhost/api/voice/tools/check_availability", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": "voice_session_505", "x-dispatch-secret": "dev_secret_dispatch_2026" },
      body: JSON.stringify({ conversation_id: "conv_el_test_123", serviceType: "HVAC", serviceZone: "Austin-South", date: "2026-09-19" })
    }));
    const availBody: any = await availRes.json();
    const validSlot = availBody.result.slots[0];

    // 3. Voice tool call to create_work_order
    const req = new Request("http://localhost/api/voice/tools/create_work_order", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": "voice_session_505", "x-dispatch-secret": "dev_secret_dispatch_2026" },
      body: JSON.stringify({
        conversation_id: "conv_el_test_123",
        slotId: validSlot.slotId,
        issueSummary: "A/C Unit Failure - Voice Call",
        urgency: "STANDARD"
      })
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(409);
    const body: any = await res.json();
    expect(body.envelope.error.code).toBe("CONFIRMATION_REQUIRED");

    const confirmed = await handleRequest(new Request("http://localhost/api/voice/tools/create_work_order", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": "voice_session_505", "x-dispatch-secret": "dev_secret_dispatch_2026" },
      body: JSON.stringify({ conversation_id: "conv_el_test_123", confirmed: true })
    }));
    expect(confirmed.status).toBe(200);
    const confirmedBody: any = await confirmed.json();
    expect(confirmedBody.result.workOrder.status).toBe("BOOKED");
  });

  it("Scenario 4: Fetches ElevenLabs voice config and system prompt", async () => {
    const req = new Request("http://localhost/api/voice/config", { method: "GET" });
    const res = await handleRequest(req);
    expect(res.status).toBe(200);
    const body: any = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.config.name).toContain("DispatchAI");
    expect(body.data.tools.length).toBe(6);
    expect(body.data.systemPrompt).toContain("Austin");
  });

  it("allows only the scoped voice-session token to invoke a tool", async () => {
    const oldKey = process.env.ELEVENLABS_API_KEY;
    const oldId = process.env.ELEVENLABS_AGENT_ID;
    process.env.ELEVENLABS_API_KEY = "test_api_key";
    process.env.ELEVENLABS_AGENT_ID = "test_agent_id";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ signed_url: "wss://example.test/voice" }), { status: 200 })));
    try {
      const session = await handleRequest(new Request("http://localhost/api/voice/session", {
        method: "POST", headers: { "x-session-id": "scoped_voice_test" }, body: "{}"
      }));
      expect(session.status).toBe(200);
      const token = (await session.json() as any).data.voiceToolToken;
      const tool = await handleRequest(new Request("http://localhost/api/voice/tools/find_customer", {
        method: "POST",
        headers: { "x-session-id": "scoped_voice_test", "x-voice-session-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "5125550101" })
      }));
      expect(tool.status).toBe(200);
      expect((await tool.json() as any).result.customer.firstName).toBe("Alicia");
      const otherSession = await handleRequest(new Request("http://localhost/api/voice/tools/find_customer", {
        method: "POST", headers: { "x-session-id": "different_session", "x-voice-session-token": token }, body: "{}"
      }));
      expect(otherSession.status).toBe(401);
    } finally {
      vi.unstubAllGlobals();
      if (oldKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = oldKey;
      if (oldId === undefined) delete process.env.ELEVENLABS_AGENT_ID; else process.env.ELEVENLABS_AGENT_ID = oldId;
    }
  });
});
