import { Agent, getAgentByName } from "agents";
import { DispatchAgent, serviceDate } from "./agent.js";
import { N8nClient } from "./client.js";
import { AgentState, createInitialAgentState } from "./state.js";
import { DispatchBusinessStore } from "./business-store.js";
import { toolFailure, toolSuccess } from "@dispatchai/shared";

export { DispatchBusinessStore } from "./business-store.js";

interface Env extends Cloudflare.Env {
  DispatchCloudAgent: DurableObjectNamespace<DispatchCloudAgent>;
  DispatchBusinessStore: DurableObjectNamespace<DispatchBusinessStore>;
  N8N: Fetcher;
  N8N_BASE_URL?: string;
  N8N_WEBHOOK_SECRET?: string;
  N8N_CLOUD_PROBE_URL?: string;
  WEB_ORIGIN?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_AGENT_ID?: string;
}

const demoPersonas = {
  south_hvac: { phone: "5125550101", propertyId: "prop_201", serviceType: "HVAC", zone: "Austin-South" },
  central_plumbing: { phone: "5125550103", propertyId: "prop_203", serviceType: "PLUMBING", zone: "Austin-Central" },
  north_hvac: { phone: "5125550104", propertyId: "prop_204", serviceType: "HVAC", zone: "Austin-North" }
} as const;
type DemoPersona = keyof typeof demoPersonas;

function client(env: Env) {
  if (!env.N8N_WEBHOOK_SECRET) throw new Error("N8N_WEBHOOK_SECRET is not configured");
  return new N8nClient({
    baseUrl: env.N8N_BASE_URL || "https://itsahsaanmughal.app.n8n.cloud",
    secret: env.N8N_WEBHOOK_SECRET,
    request: (url, init) => fetch(url, init),
    timeoutMs: 12000
  });
}

// Cloudflare owns conversation state; n8n and the domain database still own business data.
export class DispatchCloudAgent extends Agent<Env, AgentState> {
  initialState = createInitialAgentState("");

  async chat(sessionId: string, message: string) {
    if (this.state.sessionId && this.state.sessionId !== sessionId) throw new Error("Session mismatch");
    if (!this.env.N8N_WEBHOOK_SECRET) throw new Error("N8N_WEBHOOK_SECRET is not configured");
    const operationalAgent = new DispatchAgent(sessionId, client(this.env), { ...this.state, sessionId });
    const reply = await operationalAgent.processMessage(message);
    this.setState(operationalAgent.getState());
    return { reply, state: this.state, events: this.state.events };
  }

  snapshot() {
    return this.state;
  }

  async startVoice(sessionId: string, name: string, persona: DemoPersona) {
    if (this.state.sessionId && this.state.sessionId !== sessionId) throw new Error("Session mismatch");
    const binding = demoPersonas[persona];
    if (!binding) throw new Error("Unknown demo location");
    if (!this.env.ELEVENLABS_API_KEY || !this.env.ELEVENLABS_AGENT_ID) throw new Error("ElevenLabs is not configured");
    const agent = new DispatchAgent(sessionId, client(this.env), { ...this.state, sessionId });
    const lookup = await agent.findCustomer(binding.phone);
    if (!lookup.ok || !lookup.data.customer) throw new Error("Demo customer lookup failed");
    const property = lookup.data.properties.find((item) => item.id === binding.propertyId);
    if (!property) throw new Error("Demo property is missing");
    agent.setVisitorDetails(name, "");
    this.setState(agent.getState());
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(this.env.ELEVENLABS_AGENT_ID)}`, {
      headers: { "xi-api-key": this.env.ELEVENLABS_API_KEY }
    });
    if (!response.ok) throw new Error(`ElevenLabs signed URL failed (${response.status})`);
    const signed = await response.json() as { signed_url?: string };
    if (!signed.signed_url) throw new Error("ElevenLabs did not return a signed URL");
    return { signedUrl: signed.signed_url, name, address: property.addressLine1, phone: binding.phone, zone: binding.zone, serviceType: binding.serviceType, today: serviceDate(), tomorrow: serviceDate(1) };
  }

  async voiceTool(sessionId: string, persona: DemoPersona, toolName: string, params: Record<string, unknown>, conversationId?: string) {
    const binding = demoPersonas[persona];
    if (!binding || this.state.sessionId !== sessionId || this.state.selectedProperty?.id !== binding.propertyId) {
      throw new Error("Demo session is not initialized");
    }
    const agent = new DispatchAgent(sessionId, client(this.env), this.state);
    if (conversationId) agent.setElevenLabsConversationId(conversationId);
    const correlationId = `voice_${crypto.randomUUID()}`;
    let result;
    try {
      switch (toolName) {
        case "find_customer":
          result = await agent.findCustomer(binding.phone, correlationId);
          break;
        case "check_availability": {
          const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : serviceDate(1);
          result = await agent.checkAvailability(binding.serviceType, binding.zone, date, undefined, correlationId);
          break;
        }
        case "get_work_order":
          result = await agent.getWorkOrder(String(params.workOrderId || ""), correlationId);
          break;
        case "create_work_order": {
          const replay = agent.findBookingReplay(String(params.slotId || ""));
          if (replay) result = toolSuccess({ workOrder: replay.workOrder, idempotentReplay: true }, correlationId);
          else if (agent.getState().lastCreatedWorkOrderId) result = toolFailure("DEMO_BOOKING_LIMIT", "This demo session already has a booking", false, correlationId);
          else if (!agent.getState().pendingAction) {
            const action = agent.proposeBooking(String(params.slotId || ""), String(params.issueSummary || "HVAC or plumbing service request"), "STANDARD", "VOICE_AGENT");
            result = toolFailure("CONFIRMATION_REQUIRED", action.description, false, correlationId);
          } else if (agent.getState().pendingAction?.type !== "CREATE_WORK_ORDER" || params.confirmed !== true) {
            result = toolFailure("CONFIRMATION_REQUIRED", "Ask the caller for explicit confirmation before booking", false, correlationId);
          } else result = await agent.confirmPendingAction(correlationId);
          break;
        }
        case "reschedule_work_order":
        case "cancel_work_order": {
          const ownOrderId = agent.getState().lastCreatedWorkOrderId;
          if (!ownOrderId || String(params.workOrderId || "") !== ownOrderId) {
            result = toolFailure("DEMO_ORDER_ONLY", "Only this session's demo booking can be changed", false, correlationId);
          } else if (!agent.getState().pendingAction) {
            const action = toolName === "reschedule_work_order"
              ? agent.proposeReschedule(ownOrderId, String(params.newSlotId || ""))
              : agent.proposeCancellation(ownOrderId, String(params.reason || "Cancelled by caller"));
            result = toolFailure("CONFIRMATION_REQUIRED", action.description, false, correlationId);
          } else if (agent.getState().pendingAction?.type !== (toolName === "reschedule_work_order" ? "RESCHEDULE_WORK_ORDER" : "CANCEL_WORK_ORDER") || params.confirmed !== true) {
            result = toolFailure("CONFIRMATION_REQUIRED", "Ask the caller for explicit confirmation first", false, correlationId);
          } else result = await agent.confirmPendingAction(correlationId);
          break;
        }
        default:
          result = toolFailure("UNKNOWN_TOOL", "Unknown voice tool", false, correlationId);
      }
    } catch (error) {
      result = toolFailure("VOICE_TOOL_ERROR", error instanceof Error ? error.message : "Tool failed", false, correlationId);
    }
    this.setState(agent.getState());
    return {
      result: result.ok && "data" in result ? result.data : !result.ok && "error" in result ? result.error.message : "Tool could not complete",
      envelope: result
    };
  }

  async probe(correlationId: string) {
    if (!this.env.N8N_WEBHOOK_SECRET || !this.env.N8N_CLOUD_PROBE_URL) {
      throw new Error("Cloud probe is not configured");
    }
    const target = new URL(this.env.N8N_CLOUD_PROBE_URL);
    if (target.protocol !== "https:" || target.hostname !== "itsahsaanmughal.app.n8n.cloud") {
      throw new Error("Invalid n8n Cloud probe URL");
    }
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatch-secret": this.env.N8N_WEBHOOK_SECRET,
        "x-correlation-id": correlationId
      },
      body: JSON.stringify({ source: "dispatchai-agent", correlationId })
    });
    if (!response.ok) {
      return { ok: false, worker: "dispatchai-agent-sdk", n8nStatus: response.status, correlationId };
    }
    const result = await response.json() as { ok?: unknown; service?: unknown; correlationId?: unknown };
    return {
      ok: result.ok === true && result.service === "dispatchai-n8n-cloud" && result.correlationId === correlationId,
      worker: "dispatchai-agent-sdk",
      n8n: result.service,
      correlationId
    };
  }
}

async function secretMatches(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [actual, required] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const actualBytes = new Uint8Array(actual);
  const requiredBytes = new Uint8Array(required);
  let difference = 0;
  for (let i = 0; i < actualBytes.length; i++) difference |= actualBytes[i] ^ requiredBytes[i];
  return difference === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "OK", service: "DispatchAgent-Cloudflare-SDK" });
    }
    const businessPost = url.pathname.startsWith("/api/internal/");
    const businessGet = ["/api/jobs", "/api/directory", "/api/notifications"].includes(url.pathname);
    if (!["/api/chat", "/api/state", "/api/events", "/api/probe", "/api/voice/session"].includes(url.pathname) && !url.pathname.startsWith("/api/voice/tools/") && !businessPost && !businessGet) {
      return new Response("Not Found", { status: 404 });
    }
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.WEB_ORIGIN || "http://localhost:5173";
    if (origin && origin !== allowedOrigin) return new Response("Forbidden origin", { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type, x-session-id, x-dispatch-secret",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!await secretMatches(request.headers.get("x-dispatch-secret"), env.N8N_WEBHOOK_SECRET)) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    }
    if (businessPost || businessGet) {
      if ((businessPost && request.method !== "POST") || (businessGet && request.method !== "GET")) {
        return new Response("Method Not Allowed", { status: 405, headers });
      }
      try {
        const store = env.DispatchBusinessStore.getByName("austin-demo");
        const correlationId = request.headers.get("x-correlation-id") || crypto.randomUUID();
        const body = businessPost ? await request.json() : undefined;
        const result = businessPost
          ? await store.operate(url.pathname, body, correlationId)
          : await store.read(url.pathname, correlationId);
        return Response.json(result, { status: result.ok ? 200 : 400, headers });
      } catch {
        return Response.json({ error: "Invalid request or storage unavailable" }, { status: 500, headers });
      }
    }
    if (url.pathname === "/api/probe" && request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers });
    }
    const sessionId = request.headers.get("x-session-id") || url.searchParams.get("sessionId");
    if (url.pathname !== "/api/probe" && (!sessionId || sessionId.length > 128)) {
      return Response.json({ error: "Valid session ID required" }, { status: 400, headers });
    }
    try {
      const agent = await getAgentByName(env.DispatchCloudAgent, url.pathname === "/api/probe" ? "cloud-probe" : sessionId!);
      if (url.pathname === "/api/probe") {
        const correlationId = crypto.randomUUID();
        return Response.json(await agent.probe(correlationId), { headers });
      }
      if (url.pathname === "/api/chat" && request.method === "POST") {
        const body = await request.json() as { message?: unknown };
        if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 4000) {
          return Response.json({ error: "Valid message required" }, { status: 400, headers });
        }
        return Response.json(await agent.chat(sessionId!, body.message), { headers });
      }
      if (url.pathname === "/api/voice/session" && request.method === "POST") {
        const body = await request.json() as { name?: string; persona?: DemoPersona };
        if (!body.name?.trim() || body.name.length > 80 || !body.persona || !demoPersonas[body.persona]) return Response.json({ error: "Invalid demo context" }, { status: 400, headers });
        return Response.json({ ok: true, data: await agent.startVoice(sessionId!, body.name.trim(), body.persona) }, { headers });
      }
      if (url.pathname.startsWith("/api/voice/tools/") && request.method === "POST") {
        const body = await request.json() as { persona?: DemoPersona; parameters?: Record<string, unknown>; conversation_id?: string };
        if (!body.persona || !demoPersonas[body.persona]) return Response.json({ error: "Invalid demo persona" }, { status: 400, headers });
        return Response.json(await agent.voiceTool(sessionId!, body.persona, url.pathname.slice("/api/voice/tools/".length), body.parameters || {}, body.conversation_id), { headers });
      }
      if (request.method === "GET") {
        const state = await agent.snapshot();
        return Response.json(url.pathname === "/api/events" ? state.events : state, { headers });
      }
      return new Response("Method Not Allowed", { status: 405, headers });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Agent request failed" }, { status: 500, headers });
    }
  }
};
