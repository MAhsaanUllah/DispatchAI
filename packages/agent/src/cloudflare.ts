import { Agent, getAgentByName } from "agents";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";
import { AgentState, createInitialAgentState } from "./state.js";

interface Env extends Cloudflare.Env {
  DispatchCloudAgent: DurableObjectNamespace<DispatchCloudAgent>;
  N8N: Fetcher;
  N8N_BASE_URL?: string;
  N8N_WEBHOOK_SECRET?: string;
  WEB_ORIGIN?: string;
}

// Cloudflare owns conversation state; n8n and the domain database still own business data.
export class DispatchCloudAgent extends Agent<Env, AgentState> {
  initialState = createInitialAgentState("");

  async chat(sessionId: string, message: string) {
    if (this.state.sessionId && this.state.sessionId !== sessionId) throw new Error("Session mismatch");
    if (!this.env.N8N_WEBHOOK_SECRET) throw new Error("N8N_WEBHOOK_SECRET is not configured");
    const client = new N8nClient({
      baseUrl: this.env.N8N_BASE_URL || "http://localhost:5678",
      secret: this.env.N8N_WEBHOOK_SECRET,
      request: (url, init) => this.env.N8N.fetch(url, init)
    });
    const operationalAgent = new DispatchAgent(sessionId, client, { ...this.state, sessionId });
    const reply = await operationalAgent.processMessage(message);
    this.setState(operationalAgent.getState());
    return { reply, state: this.state, events: this.state.events };
  }

  snapshot() {
    return this.state;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "OK", service: "DispatchAgent-Cloudflare-SDK" });
    }
    if (!["/api/chat", "/api/state", "/api/events"].includes(url.pathname)) {
      return new Response("Not Found", { status: 404 });
    }
    const origin = request.headers.get("Origin");
    const allowedOrigin = env.WEB_ORIGIN || "http://localhost:5173";
    if (origin && origin !== allowedOrigin) return new Response("Forbidden origin", { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type, x-session-id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const sessionId = request.headers.get("x-session-id") || url.searchParams.get("sessionId");
    if (!sessionId || sessionId.length > 128) return Response.json({ error: "Valid session ID required" }, { status: 400, headers });
    try {
      const agent = await getAgentByName(env.DispatchCloudAgent, sessionId);
      if (url.pathname === "/api/chat" && request.method === "POST") {
        const body = await request.json() as { message?: unknown };
        if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 4000) {
          return Response.json({ error: "Valid message required" }, { status: 400, headers });
        }
        return Response.json(await agent.chat(sessionId, body.message), { headers });
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
