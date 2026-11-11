import { businessTemplates, DispatchService, getBusinessConfig, getDirectory, serviceZoneFor, setBusinessConfig } from "@dispatchai/domain";
import { BusinessConfigSchema, type BusinessService } from "@dispatchai/shared";
import { toolFailure, toolSuccess, verifyWebhookSignature } from "@dispatchai/shared";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";
import { ELEVENLABS_AGENT_CONFIG, ELEVENLABS_TOOLS, ELEVENLABS_SYSTEM_PROMPT } from "./elevenlabs.config.js";
import { SQLiteDispatchStore } from "../../domain/src/sqlite-store.js";
import { deliverBookingEmails } from "../../domain/src/email.js";
import { SessionStore } from "./session-store.js";
import { AuthStore, generateSetupCode, safeEqual } from "./auth-store.js";
import { buildBookingEvent } from "./outbound-events.js";
import { Outbox } from "./outbox.js";
import { SettingsStore } from "./settings-store.js";
import { PluginStore } from "./plugin-store.js";
import { pluginById, plugins } from "./plugins.js";

// Saved onboarding settings must be active before the business data (and its seed) is created below.
const settings = new SettingsStore(process.env.DATABASE_URL);
const pluginStore = new PluginStore(process.env.DATABASE_URL);
// n8n plugin settings from the dashboard win; .env values stay as a fallback for scripted installs.
async function eventTarget(): Promise<{ url: string; secret: string } | undefined> {
  const n8n = await pluginStore.get("n8n");
  const url = n8n?.enabled ? n8n.config.url : process.env.N8N_EVENTS_URL;
  const secret = n8n?.enabled ? n8n.secrets.secret : process.env.N8N_EVENTS_SECRET;
  return url && secret ? { url, secret } : undefined;
}
export const outbox = new Outbox(process.env.DATABASE_URL, eventTarget);
// Retries due events (and anything left over from before a restart). unref: never keeps the process alive.
setInterval(() => void outbox.drain(), 15_000).unref?.();
setBusinessConfig(settings.load().config);

// Multi-session agent registry: in-memory cache in front of the durable SessionStore.
const agents: Map<string, DispatchAgent> = new Map();
const sessions = new SessionStore(process.env.DATABASE_URL);
const auth = new AuthStore(process.env.DATABASE_URL);
// One-time setup code. SETUP_TOKEN in .env wins; otherwise a random code is printed once to the server log.
const setupCode = process.env.SETUP_TOKEN || generateSetupCode();
if (!auth.hasOwner()) {
  console.log(process.env.SETUP_TOKEN
    ? "[setup] No owner yet. Open /app and enter the SETUP_TOKEN from your .env."
    : `[setup] No owner yet. Open /app and enter setup code: ${setupCode}`);
}
// One process owns the business data (single writer). DATABASE_URL = SQLite file path; unset = in-memory.
const domainService = new DispatchService(process.env.DATABASE_URL ? new SQLiteDispatchStore(process.env.DATABASE_URL) : undefined);
const isTestRuntime = process.env.NODE_ENV === "test";
const dispatchSecret = process.env.N8N_WEBHOOK_SECRET || (isTestRuntime ? "dev_secret_dispatch_2026" : "");
const n8nClient = new N8nClient({
  baseUrl: process.env.N8N_BASE_URL || "http://localhost:5678",
  secret: dispatchSecret,
  directService: domainService,
  // After each create/reschedule/cancel: emails (as the HTTP domain server did) and the signed n8n event. Neither throws.
  onMutation: async (kind, workOrder) => {
    if (kind === "created") settings.markFirstBooking();
    const email = await pluginStore.get("email");
    await deliverBookingEmails(domainService.getStore(), workOrder.id, email?.enabled ? { apiKey: email.secrets.apiKey, from: email.config.from } : undefined);
    // Queued, then sent in the background: a slow or down n8n never adds latency to the caller's turn.
    if (await eventTarget()) {
      outbox.enqueue(buildBookingEvent(`booking.${kind}`, workOrder, getBusinessConfig().timeZone));
      void outbox.drain();
    }
  }
});

export function getOrCreateAgent(sessionId: string): DispatchAgent {
  let agent = agents.get(sessionId);
  if (!agent) {
    agent = new DispatchAgent(sessionId, n8nClient, sessions.loadState(sessionId));
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

const OWNER_COOKIE = "dispatch_owner";

function cookieValue(req: Request, name: string): string | undefined {
  return req.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || undefined;
}

// Secure only over HTTPS (VPS behind Caddy); a plain http://localhost or LAN install would otherwise drop the cookie.
function ownerCookie(req: Request, value: string, maxAge: number): string {
  const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return `${OWNER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${https ? "; Secure" : ""}`;
}

// Owner-edited service names -> config services. Ids come from the name; existing services keep their keywords.
function toServices(list: unknown[], current: BusinessService[]): BusinessService[] {
  return list.map((raw) => {
    const name = typeof (raw as { name?: unknown }).name === "string" ? (raw as { name: string }).name.trim() : "";
    const id = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const existing = current.find((service) => service.id === id);
    return existing ? { ...existing, name } : { id, name, description: name, priceNote: "Staff must confirm any fee or estimate.", keywords: [name.toLowerCase()] };
  });
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function sessionIdOf(req: Request): string {
  return req.headers.get("x-session-id") || new URL(req.url).searchParams.get("sessionId") || "default_session";
}

// Every non-GET request may change the conversation, so its session is saved afterwards (survives restarts).
export async function handleRequest(req: Request): Promise<Response> {
  const response = await routeRequest(req);
  if (req.method !== "GET") {
    const sessionId = sessionIdOf(req);
    const agent = agents.get(sessionId);
    if (agent) sessions.saveState(sessionId, agent.getState());
  }
  return response;
}

async function routeRequest(req: Request): Promise<Response> {
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

  const sessionId = sessionIdOf(req);
  const requestSecret = req.headers.get("x-dispatch-secret");
  const voiceToken = sessions.getToken(req.headers.get("x-voice-session-token") || "");

  // 1. Rate Limit Enforcement
  const clientKey = req.headers.get("cf-connecting-ip") || "local";
  if (!rateLimiter.check(clientKey)) {
    return new Response(
      JSON.stringify(toolFailure("RATE_LIMIT_EXCEEDED", "Too many requests. Please wait before retrying.", false, `rate_${Date.now()}`)),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // First-run owner setup (one-time). Rate limit above also slows code guessing.
  if (pathname === "/api/setup/status" && method === "GET") {
    return json({ ok: true, data: { needsSetup: !auth.hasOwner() } }, 200, corsHeaders);
  }
  if (pathname === "/api/setup" && method === "POST") {
    const body = await req.json().catch(() => ({})) as { code?: unknown; name?: unknown; pin?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (auth.hasOwner()) return json(toolFailure("SETUP_LOCKED", "Setup is already done", false, `setup_${Date.now()}`), 403, corsHeaders);
    if (typeof body.code !== "string" || !(await safeEqual(body.code.trim().toUpperCase(), setupCode.toUpperCase()))) {
      return json(toolFailure("INVALID_SETUP_CODE", "Setup code is wrong", false, `setup_${Date.now()}`), 403, corsHeaders);
    }
    if (!name || name.length > 80) return json(toolFailure("INVALID_INPUT", "Name must be 1-80 characters", false, `setup_${Date.now()}`), 400, corsHeaders);
    if (!/^\d{6,8}$/.test(pin)) return json(toolFailure("INVALID_INPUT", "PIN must be 6-8 digits", false, `setup_${Date.now()}`), 400, corsHeaders);
    if (!(await auth.createOwner(name, pin))) return json(toolFailure("SETUP_LOCKED", "Setup is already done", false, `setup_${Date.now()}`), 403, corsHeaders);
    return json(toolSuccess({ owner: name }, `setup_${Date.now()}`), 201, corsHeaders);
  }

  // Business settings (onboarding). Protected by the owner session check below.
  const businessRoute = pathname === "/api/business";

  // Owner login with PIN. Session token lives only in an HttpOnly cookie.
  const ownerToken = cookieValue(req, OWNER_COOKIE);
  if (pathname === "/api/auth/me" && method === "GET") {
    const authenticated = await auth.isValidSession(ownerToken);
    return json({ ok: true, data: { authenticated, owner: authenticated ? auth.ownerName() : undefined } }, 200, corsHeaders);
  }
  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await req.json().catch(() => ({})) as { pin?: unknown };
    const result = await auth.login(typeof body.pin === "string" ? body.pin : "");
    if ("error" in result) {
      return result.error === "LOCKED"
        ? json(toolFailure("LOCKED", `Too many wrong PINs. Try again in ${Math.ceil((result.retryAfterMs ?? 0) / 60000)} minutes.`, true, `login_${Date.now()}`), 429, corsHeaders)
        : json(toolFailure("WRONG_PIN", "PIN is wrong", false, `login_${Date.now()}`), 401, corsHeaders);
    }
    return json(toolSuccess({ owner: auth.ownerName() }, `login_${Date.now()}`), 200, { ...corsHeaders, "Set-Cookie": ownerCookie(req, result.token, 86400) });
  }
  if (pathname === "/api/auth/logout" && method === "POST") {
    await auth.logout(ownerToken);
    return json(toolSuccess({ loggedOut: true }, `logout_${Date.now()}`), 200, { ...corsHeaders, "Set-Cookie": ownerCookie(req, "", 0) });
  }

  // Once an owner exists, every other API call needs an owner session. Voice tool and webhook routes keep their own secret/signature checks.
  const selfAuthenticated = pathname.startsWith("/api/voice/tools/") || pathname === "/api/voice/webhook";
  if (pathname.startsWith("/api/") && !selfAuthenticated && auth.hasOwner() && !(await auth.isValidSession(ownerToken))) {
    return json(toolFailure("UNAUTHORIZED", "Log in with your PIN", false, `auth_${Date.now()}`), 401, corsHeaders);
  }

  // Plugins page. Secrets are write-only: the API says whether one is saved, never what it is.
  if (pathname === "/api/plugins" && method === "GET") {
    const list = await Promise.all(plugins.map(async (plugin) => {
      const record = await pluginStore.get(plugin.id);
      return {
        id: plugin.id, name: plugin.name, category: plugin.category, description: plugin.description, limits: plugin.limits,
        enabled: record?.enabled ?? false,
        fields: plugin.fields.map((field) => ({ ...field, value: field.secret ? "" : record?.config[field.key] ?? "", saved: field.secret ? Boolean(record?.secrets[field.key]) : undefined })),
        preview: plugin.preview?.()
      };
    }));
    return json({ ok: true, data: { plugins: list } }, 200, corsHeaders);
  }
  // n8n delivery log and manual Retry.
  if (pathname === "/api/plugins/n8n/deliveries" && method === "GET") {
    return json({ ok: true, data: { deliveries: outbox.recent() } }, 200, corsHeaders);
  }
  const retryMatch = /^\/api\/plugins\/n8n\/deliveries\/([\w-]+)\/retry$/.exec(pathname);
  if (retryMatch && method === "POST") {
    if (!outbox.retry(retryMatch[1])) return json(toolFailure("NOT_FOUND", "No undelivered event with that id", false, `retry_${Date.now()}`), 404, corsHeaders);
    await outbox.drain();
    return json({ ok: true, data: { delivery: outbox.recent(50).find((d) => d.id === retryMatch[1]) } }, 200, corsHeaders);
  }

  const pluginMatch = /^\/api\/plugins\/([a-z0-9-]+)(\/test)?$/.exec(pathname);
  if (pluginMatch) {
    const plugin = pluginById(pluginMatch[1]);
    if (!plugin) return json(toolFailure("NOT_FOUND", "Unknown plugin", false, `plugin_${Date.now()}`), 404, corsHeaders);
    const current = (await pluginStore.get(plugin.id)) ?? { enabled: false, config: {}, secrets: {} };
    if (pluginMatch[2] && method === "POST") {
      if (plugin.validate({ ...current.config, ...current.secrets })) return json({ ok: true, data: { ok: false, message: "Save the settings first." } }, 200, corsHeaders);
      return json({ ok: true, data: await plugin.test(current) }, 200, corsHeaders);
    }
    if (!pluginMatch[2] && method === "PUT") {
      const body = await req.json().catch(() => ({})) as { values?: Record<string, unknown>; enabled?: unknown };
      const next = { enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled, config: { ...current.config }, secrets: { ...current.secrets } };
      for (const field of plugin.fields) {
        const value = body.values?.[field.key];
        if (typeof value !== "string") continue;
        // Empty secret = keep the saved one (the page never receives it back).
        if (field.secret) { if (value.trim()) next.secrets[field.key] = value.trim(); } else next.config[field.key] = value.trim();
      }
      const problem = next.enabled ? plugin.validate({ ...next.config, ...next.secrets }) : null;
      if (problem) return json(toolFailure("INVALID_INPUT", problem, false, `plugin_${Date.now()}`), 400, corsHeaders);
      await pluginStore.save(plugin.id, next);
      return json(toolSuccess({ enabled: next.enabled }, `plugin_${Date.now()}`), 200, corsHeaders);
    }
  }

  // Staff list from onboarding. Each member does the listed services in every business zone/location.
  if (pathname === "/api/staff" && method === "PUT") {
    const body = await req.json().catch(() => ({})) as { staff?: unknown };
    const config = getBusinessConfig();
    const known = new Set(config.services.map((service) => service.id));
    const list = Array.isArray(body.staff) ? body.staff : null;
    const staff = list?.map((raw) => {
      const member = raw as { id?: unknown; name?: unknown; skills?: unknown };
      const name = typeof member.name === "string" ? member.name.trim() : "";
      const skills = Array.isArray(member.skills) ? member.skills.filter((skill): skill is string => typeof skill === "string" && known.has(skill)) : [];
      return { id: typeof member.id === "string" ? member.id : undefined, name, skills };
    });
    if (!staff || staff.some((member) => !member.name || member.name.length > 80 || member.skills.length === 0)) {
      return json(toolFailure("INVALID_INPUT", "Each staff member needs a name and at least one service", false, `staff_${Date.now()}`), 400, corsHeaders);
    }
    const blocked = domainService.getStore().setStaff(staff, config.serviceZones);
    if (blocked.length > 0) {
      return json(toolFailure("STAFF_HAS_BOOKINGS", `Cannot remove staff with upcoming bookings: ${blocked.join(", ")}`, false, `staff_${Date.now()}`), 409, corsHeaders);
    }
    return json(toolSuccess({ staff: [...domainService.getStore().technicians.values()] }, `staff_${Date.now()}`), 200, corsHeaders);
  }

  if (businessRoute && method === "GET") {
    const saved = settings.load();
    return json({ ok: true, data: {
      config: getBusinessConfig(),
      configured: saved.config !== undefined,
      canSwitchTemplate: !saved.firstBookingAt,
      templates: businessTemplates.map((t) => ({ templateId: t.templateId, name: t.name, kind: t.kind, services: t.services.map((service) => service.name) }))
    } }, 200, corsHeaders);
  }
  if (businessRoute && method === "PUT") {
    const body = await req.json().catch(() => ({})) as { templateId?: unknown; name?: unknown; market?: unknown; timeZone?: unknown; serviceZones?: unknown; services?: unknown; hours?: unknown; slotMinutes?: unknown };
    const current = getBusinessConfig();
    const templateId = typeof body.templateId === "string" ? body.templateId : current.templateId;
    const switching = templateId !== current.templateId;
    if (switching && settings.load().firstBookingAt) {
      return json(toolFailure("TEMPLATE_LOCKED", "The business type cannot change after the first real booking", false, `biz_${Date.now()}`), 409, corsHeaders);
    }
    const base = switching ? businessTemplates.find((t) => t.templateId === templateId) : current;
    if (!base) return json(toolFailure("INVALID_INPUT", "Unknown business type", false, `biz_${Date.now()}`), 400, corsHeaders);
    const text = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);
    const zones = Array.isArray(body.serviceZones) ? body.serviceZones.map(text).filter((zone): zone is string => !!zone) : undefined;
    const parsed = BusinessConfigSchema.safeParse({
      ...base,
      name: text(body.name) ?? base.name,
      market: text(body.market) ?? base.market,
      timeZone: text(body.timeZone) ?? base.timeZone,
      serviceZones: zones ?? base.serviceZones,
      services: Array.isArray(body.services) ? toServices(body.services, base.services) : base.services,
      hours: body.hours ?? base.hours,
      slotMinutes: body.slotMinutes ?? base.slotMinutes
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return json(toolFailure("INVALID_INPUT", `${issue.path.join(".")}: ${issue.message}`, false, `biz_${Date.now()}`), 400, corsHeaders);
    }
    settings.saveConfig(parsed.data);
    setBusinessConfig(parsed.data);
    if (switching) {
      // No real booking yet, so the old template's demo data is replaced by the new template's.
      domainService.getStore().reset();
      agents.clear();
    }
    // Hours, slot length or zones may have changed: regenerate future free slots.
    domainService.getStore().rebuildFutureSlots();
    return json(toolSuccess({ config: parsed.data }, `biz_${Date.now()}`), 200, corsHeaders);
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
    domainService.getStore().reset();
    return new Response(JSON.stringify(toolSuccess({ reset: true }, `reset_${Date.now()}`)), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
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
    const store = domainService.getStore();
    const jobs = Array.from(store.workOrders.values()).map((job) => {
      const property = job.propertyId ? store.properties.get(job.propertyId) : undefined;
      return { ...job, zone: serviceZoneFor(property), technicianName: store.technicians.get(job.technicianId ?? "")?.name, propertyAddress: property?.addressLine1 };
    });
    return new Response(JSON.stringify({ ok: true, data: { jobs } }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (method === "GET" && pathname === "/api/directory") {
    return new Response(JSON.stringify({ ok: true, data: getDirectory(domainService.getStore()) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (method === "GET" && pathname === "/api/notifications") {
    return new Response(JSON.stringify({ ok: true, data: { notifications: [...domainService.getStore().notifications].reverse() } }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
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
        const visitorName = typeof body.visitorName === "string" ? body.visitorName.trim().slice(0, 80) : "";
        const visitorEmail = typeof body.visitorEmail === "string" ? body.visitorEmail.trim().toLowerCase() : "";
        if (visitorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail)) {
          return new Response(
            JSON.stringify(toolFailure("INVALID_INPUT", "visitorEmail must be a valid email address", false, `voice_${Date.now()}`)),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
          headers: { "xi-api-key": apiKey }
        });
        if (!response.ok) throw new Error(`ElevenLabs signed URL request failed (${response.status})`);
        const signed = await response.json() as { signed_url?: string };
        if (!signed.signed_url) throw new Error("ElevenLabs did not return a signed URL");
        const voiceToolToken = crypto.randomUUID();
        sessions.saveToken(voiceToolToken, { sessionId, expiresAt: Date.now() + 60 * 60 * 1000 });
        const convId = body.conversationId || null;
        if (convId) agent.setElevenLabsConversationId(convId);
        if (visitorEmail) agent.setVisitorDetails(visitorName || "Website visitor", visitorEmail);
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              sessionId,
              elevenLabsConversationId: convId,
              status: "READY",
              signedUrl: signed.signed_url,
              voiceToolToken,
              ...(visitorEmail ? { visitorName: visitorName || "Website visitor", visitorEmail } : {})
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


async function handleConfirmedMutation(agent: DispatchAgent, type: string, params: any, correlationId: string) {
  const pending = agent.getState().pendingAction;
  // An immediate redundant replay of the last successful booking must not open a second
  // confirmation cycle: return the original result idempotently instead of mutating again.
  if (!pending && type === "CREATE_WORK_ORDER") {
    const replay = agent.findBookingReplay(params?.slotId);
    if (replay) {
      return toolSuccess({ workOrder: replay.workOrder, idempotentReplay: true }, correlationId);
    }
  }
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
