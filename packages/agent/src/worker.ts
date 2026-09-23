import { DispatchService } from "@dispatchai/domain";
import { toolFailure, toolSuccess, verifyWebhookSignature } from "@dispatchai/shared";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";
import { ELEVENLABS_AGENT_CONFIG, ELEVENLABS_TOOLS, ELEVENLABS_SYSTEM_PROMPT } from "./elevenlabs.config.js";

// Multi-session agent registry
const agents: Map<string, DispatchAgent> = new Map();
// ponytail: In-memory one-hour voice capabilities suit local demos; use durable session auth for multi-instance deployment.
const voiceTokens = new Map<string, { sessionId: string; expiresAt: number }>();
const domainService = new DispatchService();
const isTestRuntime = process.env.NODE_ENV === "test";
const dispatchSecret = process.env.N8N_WEBHOOK_SECRET || (isTestRuntime ? "dev_secret_dispatch_2026" : "");
const n8nClient = new N8nClient({
  baseUrl: process.env.N8N_BASE_URL || "http://localhost:5678",
  secret: dispatchSecret,
  directService: isTestRuntime ? domainService : undefined
});

export function getOrCreateAgent(sessionId: string): DispatchAgent {
  let agent = agents.get(sessionId);
  if (!agent) {
    agent = new DispatchAgent(sessionId, n8nClient);
    agents.set(sessionId, agent);
  }
  return agent;
}

// Rate Limiting sliding window store
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private limit = 120; // Dashboard polling and voice tools share this local API.
  private windowMs = 60 * 1000;

  public check(key: string): boolean {
    const now = Date.now();
    let timestamps = this.requests.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < this.windowMs);
    if (timestamps.length >= this.limit) {
      return false;
    }
    timestamps.push(now);
    this.requests.set(key, timestamps);
    return true;
  }

  public reset(): void {
    this.requests.clear();
  }
}

const rateLimiter = new RateLimiter();

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  const allowedOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-session-id, x-dispatch-secret, x-voice-session-token, x-correlation-id"
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sessionId = req.headers.get("x-session-id") || url.searchParams.get("sessionId") || "default_session";
  const requestSecret = req.headers.get("x-dispatch-secret");
  const voiceToken = voiceTokens.get(req.headers.get("x-voice-session-token") || "");

  // 1. Rate Limit Enforcement
  const clientKey = req.headers.get("cf-connecting-ip") || "local";
  if (!rateLimiter.check(clientKey)) {
    return new Response(
      JSON.stringify(toolFailure("RATE_LIMIT_EXCEEDED", "Too many requests. Please wait before retrying.", false, `rate_${Date.now()}`)),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Secret Authentication Enforcement for protected endpoints
  const isProtectedToolRoute = pathname.startsWith("/api/voice/tools/");
  const hasServerSecret = !!dispatchSecret && requestSecret === dispatchSecret;
  const hasVoiceToken = !!voiceToken && voiceToken.sessionId === sessionId && voiceToken.expiresAt > Date.now();
  if (isProtectedToolRoute && !hasServerSecret && !hasVoiceToken) {
    return new Response(
      JSON.stringify(toolFailure("UNAUTHORIZED", "Invalid or missing x-dispatch-secret authentication header", false, `auth_${Date.now()}`)),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const agent = getOrCreateAgent(sessionId);

  // 1. Text chat interaction
  if (method === "POST" && pathname === "/api/chat") {
    return (async () => {
      try {
        const body: any = await req.json();
        const text = body.message || body.text || "";
        const reply = await agent.processMessage(text);
        return new Response(
          JSON.stringify({
            reply,
            state: agent.getState(),
            events: agent.getState().events
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify(toolFailure("AGENT_ERROR", err.message, false, `err_${Date.now()}`)),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    })();
  }

  // 2. Explicit confirmation endpoint
  if (method === "POST" && pathname === "/api/confirm") {
    return (async () => {
      try {
        const result = await agent.confirmPendingAction();
        return new Response(
          JSON.stringify(result),
          { status: (result as any).ok ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify(toolFailure("CONFIRM_ERROR", err.message, false, `err_${Date.now()}`)),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    })();
  }

  if (method === "POST" && pathname === "/api/reject") {
    return new Response(JSON.stringify(agent.rejectPendingAction()), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (method === "POST" && pathname === "/api/reset") {
    const body = await req.json().catch(() => ({})) as { confirm?: string };
    if (body.confirm !== "RESET_LOCAL_DATA") {
      return new Response(JSON.stringify(toolFailure("CONFIRMATION_REQUIRED", "Explicit local data reset confirmation required", false, `reset_${Date.now()}`)), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (isTestRuntime) {
      domainService.getStore().reset();
      return new Response(JSON.stringify(toolSuccess({ reset: true }, `reset_${Date.now()}`)), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    return proxyDatabaseRequest("/api/reset", "POST", corsHeaders, JSON.stringify(body));
  }

  // 3. State retrieval
  if (method === "GET" && pathname === "/api/state") {
    return new Response(
      JSON.stringify(agent.getState()),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 4. Realtime Event Log
  if (method === "GET" && pathname === "/api/events") {
    return new Response(
      JSON.stringify(agent.getState().events),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 5. Jobs list for dashboard
  if (method === "GET" && pathname === "/api/jobs") {
    if (isTestRuntime) {
      const jobs = Array.from(domainService.getStore().workOrders.values());
      return new Response(JSON.stringify({ ok: true, data: { jobs } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    return proxyDatabaseRequest("/api/jobs", "GET", corsHeaders);
  }

  if (method === "GET" && pathname === "/api/notifications") {
    if (isTestRuntime) {
      return new Response(JSON.stringify({ ok: true, data: { notifications: [...domainService.getStore().notifications].reverse() } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    return proxyDatabaseRequest("/api/notifications", "GET", corsHeaders);
  }

  // 6. ElevenLabs Voice Agent Config
  if (method === "GET" && pathname === "/api/voice/config") {
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          config: ELEVENLABS_AGENT_CONFIG,
          tools: ELEVENLABS_TOOLS,
          systemPrompt: ELEVENLABS_SYSTEM_PROMPT
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 7. ElevenLabs Voice Session Creation/Binding
  if (method === "POST" && pathname === "/api/voice/session") {
    return (async () => {
      try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        const agentId = process.env.ELEVENLABS_AGENT_ID;
        if (!apiKey || !agentId || apiKey.startsWith("your_") || agentId.startsWith("your_")) {
          return new Response(JSON.stringify(toolFailure("VOICE_NOT_CONFIGURED", "ElevenLabs API key and agent ID are required for a real voice session", false, `voice_${Date.now()}`)), {
            status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const body: any = await req.json().catch(() => ({}));
        const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
          headers: { "xi-api-key": apiKey }
        });
        if (!response.ok) throw new Error(`ElevenLabs signed URL request failed (${response.status})`);
        const signed = await response.json() as { signed_url?: string };
        if (!signed.signed_url) throw new Error("ElevenLabs did not return a signed URL");
        const voiceToolToken = crypto.randomUUID();
        voiceTokens.set(voiceToolToken, { sessionId, expiresAt: Date.now() + 60 * 60 * 1000 });
        const convId = body.conversationId || null;
        if (convId) agent.setElevenLabsConversationId(convId);
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              sessionId,
              elevenLabsConversationId: convId,
              status: "READY",
              signedUrl: signed.signed_url,
              voiceToolToken
            }
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify(toolFailure("VOICE_SESSION_ERROR", err.message, false, `err_${Date.now()}`)),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    })();
  }

  // 8. ElevenLabs Controlled Tool Webhook Execution Bridge
  if (method === "POST" && pathname === "/api/voice/webhook") {
    return (async () => {
      const rawBody = await req.text();
      const signature = req.headers.get("x-elevenlabs-signature") || "";
      const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET || "";
      if (!(await verifyWebhookSignature(rawBody, signature, webhookSecret))) {
        return new Response(JSON.stringify(toolFailure("UNAUTHORIZED", "Invalid webhook signature", false, `auth_${Date.now()}`)), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return handleVoiceTool(JSON.parse(rawBody), pathname, agent, corsHeaders);
    })();
  }

  if (method === "POST" && pathname.startsWith("/api/voice/tools/")) {
    return (async () => {
      try {
        const body: any = await req.json();
        return handleVoiceTool(body, pathname, agent, corsHeaders);
      } catch (err: any) {
        return new Response(
          JSON.stringify(toolFailure("VOICE_TOOL_ERROR", err.message, false, `err_${Date.now()}`)),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    })();
  }

  // Health
  if (method === "GET" && pathname === "/health") {
    return new Response(JSON.stringify({ status: "OK", service: "DispatchAgent-Cloudflare" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Cloudflare Workers fetch handler
export default {
  fetch(request: Request): Response | Promise<Response> {
    return handleRequest(request);
  }
};

async function handleVoiceTool(
  body: any,
  pathname: string,
  agent: DispatchAgent,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const toolName = body.tool_name || body.toolName || pathname.replace("/api/voice/tools/", "");
  const params = body.parameters || body.args || body;
  const convId = body.conversation_id || body.elevenLabsConversationId;
  if (convId) agent.setElevenLabsConversationId(convId);

  const correlationId = `voice_corr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  let result: any;
  switch (toolName) {
    case "find_customer": result = await agent.findCustomer(params.phone, correlationId); break;
    case "check_availability": result = await agent.checkAvailability(params.serviceType, params.serviceZone, params.date, params.preferredWindow, correlationId); break;
    case "get_work_order": result = await agent.getWorkOrder(params.workOrderId, correlationId); break;
    case "create_work_order":
      result = await handleConfirmedMutation(agent, "CREATE_WORK_ORDER", params, correlationId);
      break;
    case "reschedule_work_order":
      result = await handleConfirmedMutation(agent, "RESCHEDULE_WORK_ORDER", params, correlationId);
      break;
    case "cancel_work_order":
      result = await handleConfirmedMutation(agent, "CANCEL_WORK_ORDER", params, correlationId);
      break;
    default: result = toolFailure("UNKNOWN_TOOL", `Tool ${toolName} is not recognized`, false, correlationId);
  }
  return new Response(JSON.stringify({ result: result.ok ? (result.data || result) : result.error?.message, envelope: result }), {
    status: result.ok ? 200 : result.error?.code === "CONFIRMATION_REQUIRED" ? 409 : 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function proxyDatabaseRequest(path: string, method: string, corsHeaders: Record<string, string>, body?: string): Promise<Response> {
  const baseUrl = (process.env.DATABASE_SERVICE_URL || "http://localhost:3000").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "x-dispatch-secret": dispatchSecret, "Content-Type": "application/json" },
    body
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function handleConfirmedMutation(agent: DispatchAgent, type: string, params: any, correlationId: string) {
  const pending = agent.getState().pendingAction;
  if (!pending) {
    if (type === "CREATE_WORK_ORDER") agent.proposeBooking(params.slotId, params.issueSummary, params.urgency || "STANDARD", "VOICE_AGENT");
    if (type === "RESCHEDULE_WORK_ORDER") agent.proposeReschedule(params.workOrderId, params.newSlotId);
    if (type === "CANCEL_WORK_ORDER") agent.proposeCancellation(params.workOrderId, params.reason);
    return toolFailure("CONFIRMATION_REQUIRED", "Explicit customer confirmation is required before this action", false, correlationId);
  }
  if (pending.type !== type || params.confirmed !== true) {
    return toolFailure("CONFIRMATION_REQUIRED", "The pending action must be explicitly confirmed", false, correlationId);
  }
  return agent.confirmPendingAction(correlationId);
}
