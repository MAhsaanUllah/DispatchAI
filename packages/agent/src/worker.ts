import { existsSync, statSync } from "node:fs";
import { createBackup } from "./backup.js";
import { businessTemplates, DispatchService, getBusinessConfig, getDirectory, localDate, serviceZoneFor, setBusinessConfig, zonedTimeToUtc } from "@dispatchai/domain";
import { BusinessConfigSchema, WeekHoursSchema, type BusinessService } from "@dispatchai/shared";
import { toolFailure, toolSuccess } from "@dispatchai/shared";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";
import { SQLiteDispatchStore } from "../../domain/src/sqlite-store.js";
import { deliverBookingEmails } from "../../domain/src/email.js";
import { dueReminders, reminderKey, ReminderLog } from "./reminders.js";
import { SessionStore } from "./session-store.js";
import { AuthStore, generateSetupCode, safeEqual } from "./auth-store.js";
import { buildBookingEvent } from "./outbound-events.js";
import { Outbox } from "./outbox.js";
import { Inbox, SLA_MINUTES } from "./inbox.js";
import { SettingsStore } from "./settings-store.js";
import { PluginStore } from "./plugin-store.js";
import { llmConfig, pluginById, plugins } from "./plugins.js";
import { extract, setUsageSink, toCanonical } from "./llm.js";
import { estimateCostUsd, UsageLog } from "./usage-store.js";
import { ApiKeyStore, type ApiKeyScope } from "./api-keys.js";
import { tunnel } from "./tunnel.js";
import { handleApiV1 } from "./api-v1.js";
import { handleMcp } from "./mcp.js";
import { dialTwiml, fetchTwilioAccount, gatherTwiml, hangupTwiml, isOpenNow, maskPhone, verifyTwilioSignature } from "./twilio.js";

// shortcut: recent phone calls kept in memory (last 20) for the Twilio card; persist if owners need a call history.
const recentCalls = new Map<string, { id: string; from: string; startedAt: string; turns: number; silences: number; outcome: string }>();

// Saved onboarding settings must be active before the business data (and its seed) is created below.
const settings = new SettingsStore(process.env.DATABASE_URL);
const pluginStore = new PluginStore(process.env.DATABASE_URL);
const usageLog = new UsageLog(process.env.DATABASE_URL);
const apiKeys = new ApiKeyStore(process.env.DATABASE_URL);
// Starts, restarts or stops cloudflared to match the "tunnel" plugin: at boot, and every time the plugin is saved.
async function syncTunnel() {
  const record = await pluginStore.get("tunnel");
  if (!record?.enabled) return tunnel.stop();
  tunnel.start({ mode: record.config.mode === "token" ? "token" : "quick", token: record.secrets.token, publicUrl: record.config.publicUrl, port: Number(process.env.AGENT_PORT || 8787) });
}
void syncTunnel();
setUsageSink((row) => usageLog.add({ at: new Date().toISOString(), ...row }));
// n8n plugin settings from the dashboard win; .env values stay as a fallback for scripted installs.
async function eventTarget(): Promise<{ url: string; secret: string } | undefined> {
  const n8n = await pluginStore.get("n8n");
  const url = n8n?.enabled ? n8n.config.url : process.env.N8N_EVENTS_URL;
  const secret = n8n?.enabled ? n8n.secrets.secret : process.env.N8N_EVENTS_SECRET;
  return url && secret ? { url, secret } : undefined;
}
export const inbox = new Inbox(process.env.DATABASE_URL);
export const outbox = new Outbox(process.env.DATABASE_URL, eventTarget, (d) =>
  inbox.add("delivery_failed", d.id, `n8n did not receive ${d.type} for ${d.bookingId.replace(/^wo_/, "WO-")}`, `Last error: ${d.lastError ?? "unknown"} after ${d.attempts} tries. Use Retry on the Plugins page.`));
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
export const domainService = new DispatchService(process.env.DATABASE_URL ? new SQLiteDispatchStore(process.env.DATABASE_URL) : undefined);
const isTestRuntime = process.env.NODE_ENV === "test";
const n8nClient = new N8nClient({
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

// Appointment reminders (plugin "reminders"): email only in v1. Checked every minute and once at start,
// so reminders that fell due while the server was off still go out (once) if the appointment has not started.
const reminderLog = new ReminderLog(process.env.DATABASE_URL);
export async function runReminders(now = Date.now()): Promise<number> {
  const reminders = await pluginStore.get("reminders");
  if (!reminders?.enabled) return 0;
  const email = await pluginStore.get("email");
  const creds = email?.enabled ? { apiKey: email.secrets.apiKey, from: email.config.from } : undefined;
  const store = domainService.getStore();
  const due = dueReminders(store.workOrders.values(), Number(reminders.config.hoursBefore) || 24, now, (key) => reminderLog.has(key));
  for (const wo of due) {
    reminderLog.mark(reminderKey(wo));
    if (domainService.queueReminder(wo.id)) await deliverBookingEmails(store, wo.id, creds, "REMINDER");
  }
  return due.length;
}
setTimeout(() => void runReminders(), 1000).unref?.();
setInterval(() => void runReminders(), 60_000).unref?.();

export function getOrCreateAgent(sessionId: string): DispatchAgent {
  let agent = agents.get(sessionId);
  if (!agent) {
    agent = new DispatchAgent(sessionId, n8nClient, sessions.loadState(sessionId));
    agents.set(sessionId, agent);
    const self = agent;
    // AI brain plugin (optional): only consulted for messages the rules did not understand.
    agent.understand = async (text) => {
      const ai = await pluginStore.get("ai");
      if (!ai?.enabled) return null;
      const config = getBusinessConfig();
      const extraction = await extract(llmConfig(ai.config, ai.secrets), text, config.services);
      return extraction ? toCanonical(extraction, config.services) : null;
    };
    // Things the agent cannot finish alone become inbox tasks for the owner/staff.
    agent.subscribe((event) => {
      const caller = self.getState().customer;
      const who = caller ? `${caller.firstName} ${caller.lastName} (${caller.phone})` : "Unknown caller";
      if (event.type === "HANDOFF_REQUESTED") {
        const reason = event.payload?.reason === "emergency" ? "emergency" : "human";
        inbox.add(reason, sessionId, reason === "emergency" ? `Possible emergency: ${who}` : `Call back: ${who}`, `Caller said: "${event.payload?.text ?? ""}"`);
      } else if (event.type === "TOOL_CALL_FAILED" && event.payload?.retryable === true) {
        // Retryable = system trouble (already retried), not a normal "slot taken" answer.
        inbox.add("tool_failure", sessionId, `Booking system error for ${who}`, `${event.toolName}: ${event.payload?.message ?? "failed"}`);
      }
    });
  }
  return agent;
}

// Rate Limiting sliding window store
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private limit = 120; // Dashboard polling and voice tools share this local API.
  private windowMs = 60 * 1000;

  public check(key: string, limit = this.limit): boolean {
    const now = Date.now();
    let timestamps = this.requests.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < this.windowMs);
    if (timestamps.length >= limit) {
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

// Dashboard rows: the work order plus names the owner sees (also the developer API's booking list).
function jobRows() {
  const store = domainService.getStore();
  return Array.from(store.workOrders.values()).map((job) => {
    const property = job.propertyId ? store.properties.get(job.propertyId) : undefined;
    return { ...job, zone: serviceZoneFor(property), technicianName: store.technicians.get(job.technicianId ?? "")?.name, propertyAddress: property?.addressLine1 };
  });
}

async function routeRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  const allowedOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-session-id, x-dispatch-secret, x-voice-session-token, x-correlation-id"
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sessionId = sessionIdOf(req);

  const agent = getOrCreateAgent(sessionId);
  // x-client-ip is set by agent-server.ts from the connection itself, never taken from the caller.
  const clientKey = req.headers.get("x-client-ip") || "local";
  // An open dashboard tab polls about 45 times a minute and a whole shop can sit behind one public address, so a valid
  // login gets its own, larger allowance. Everyone else is limited per address.
  const ownerToken = cookieValue(req, OWNER_COOKIE);
  const user = await auth.session(ownerToken);
  if (!(user ? rateLimiter.check(`session:${ownerToken}`, 600) : rateLimiter.check(clientKey))) {
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
  if (pathname === "/api/auth/me" && method === "GET") {
    return json({ ok: true, data: { authenticated: !!user, owner: user?.name, role: user?.role } }, 200, corsHeaders);
  }
  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await req.json().catch(() => ({})) as { pin?: unknown; name?: unknown };
    const result = await auth.login(typeof body.pin === "string" ? body.pin : "", typeof body.name === "string" ? body.name : "", clientKey);
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

  // Once an owner exists, every other API call needs an owner session. The Twilio phone line
  // keeps its own signature check instead.
  const selfAuthenticated = pathname === "/api/twilio/voice" || pathname.startsWith("/api/v1/") || pathname === "/api/mcp";
  if (pathname.startsWith("/api/") && !selfAuthenticated && auth.hasOwner() && !user) {
    return json(toolFailure("UNAUTHORIZED", "Log in with your PIN", false, `auth_${Date.now()}`), 401, corsHeaders);
  }
  // On a fresh install nobody has logged in yet, but a server on the internet must not let strangers read or change
  // anything before the owner finishes setup. Only the setup and login routes above are open. (Tests run open.)
  if (pathname.startsWith("/api/") && !selfAuthenticated && !auth.hasOwner() && (process.env.NODE_ENV !== "test" || process.env.DISPATCH_LOCK_BEFORE_SETUP === "1")) {
    return json(toolFailure("SETUP_REQUIRED", "Finish first-run setup first", false, `auth_${Date.now()}`), 403, corsHeaders);
  }
  // Developer API: a Bearer key replaces the dashboard login (see api-v1.ts).
  if (pathname.startsWith("/api/v1/") || pathname === "/api/mcp") {
    const deps = { keys: apiKeys, client: n8nClient, bookings: jobRows, inbox, allow: (key: string) => rateLimiter.check(key), cors: corsHeaders };
    return pathname === "/api/mcp" ? handleMcp(req, deps) : handleApiV1(req, deps);
  }
  // Twilio phone line: every caller turn arrives here. Twilio's signature replaces the dashboard login.
  if (pathname === "/api/twilio/voice" && method === "POST") {
    const twilio = await pluginStore.get("twilio");
    const form = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
    if (!twilio?.enabled) return new Response("Phone line not connected", { status: 403 });
    const publicUrl = twilio.config.publicUrl.replace(/\/$/, "");
    if (!verifyTwilioSignature(twilio.secrets.authToken, `${publicUrl}${pathname}${url.search}`, form, req.headers.get("x-twilio-signature"))) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }
    const xml = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "text/xml" } });
    const action = `${publicUrl}/api/twilio/voice`;
    const sessionId = `call_${form.CallSid ?? "unknown"}`;
    const call = recentCalls.get(sessionId) ?? { id: sessionId, from: maskPhone(form.From ?? ""), startedAt: new Date().toISOString(), turns: 0, silences: 0, outcome: "In progress" };
    recentCalls.set(sessionId, call);
    while (recentCalls.size > 20) recentCalls.delete(recentCalls.keys().next().value!);

    // Handoff: forward to staff while open, otherwise a call-back task in the inbox.
    const handoff = (say: string) => {
      const config = getBusinessConfig();
      if (twilio.config.staffPhone && isOpenNow(config)) {
        call.outcome = "Forwarded to staff";
        return xml(dialTwiml(`${say} Connecting you to our team now.`, twilio.config.staffPhone));
      }
      inbox.add("human", sessionId, `Call back: ${form.From ?? "unknown number"}`, "The caller needs a person (handoff from the phone line).");
      call.outcome = "Call-back requested";
      return xml(hangupTwiml(`${say} Our team will call you back as soon as we open. Goodbye.`));
    };

    if (!("SpeechResult" in form) && call.turns === 0 && call.silences === 0) {
      return xml(gatherTwiml(`Thanks for calling ${getBusinessConfig().name}. How can I help you today?`, action));
    }
    const speech = (form.SpeechResult ?? "").trim();
    if (!speech) {
      call.silences += 1;
      return call.silences === 1 ? xml(gatherTwiml("Sorry, I did not hear anything. How can I help?", action)) : handoff("I still cannot hear you.");
    }
    call.turns += 1;
    const agent = getOrCreateAgent(sessionId);
    const before = agent.getState().events.length;
    const reply = await agent.processMessage(speech);
    sessions.saveState(sessionId, agent.getState());
    if (/confirmed your appointment|booked/i.test(reply) && agent.getState().activeWorkOrder) call.outcome = `Booked ${agent.getState().activeWorkOrder!.id.replace(/^wo_/, "WO-")}`;
    if (agent.getState().events.slice(before).some((event) => event.type === "HANDOFF_REQUESTED")) return handoff(reply);
    return xml(gatherTwiml(reply, action));
  }
  if (pathname === "/api/plugins/twilio/calls" && method === "GET" && user?.role === "owner") {
    return json({ ok: true, data: { calls: [...recentCalls.values()].reverse() } }, 200, corsHeaders);
  }

  // Staff run the day (bookings, inbox, chat); only the owner changes settings, plugins, logins or resets data.
  const ownerOnly = pathname.startsWith("/api/plugins") || pathname.startsWith("/api/users") || pathname === "/api/reset" || pathname === "/api/backup" || pathname === "/api/usage" || pathname.startsWith("/api/api-keys")
    || (method !== "GET" && (pathname === "/api/business" || pathname === "/api/staff"));
  if (ownerOnly && user?.role === "staff") {
    return json(toolFailure("FORBIDDEN", "Only the owner can change this", false, `auth_${Date.now()}`), 403, corsHeaders);
  }

  // What the AI brain and the phone line have used. Tokens are the provider's own counts; dollars are the owner's
  // own prices times those tokens, so nothing here is a guessed price. Twilio figures come from Twilio's API.
  if (pathname === "/api/usage" && method === "GET") {
    const config = getBusinessConfig();
    const dayStart = zonedTimeToUtc(localDate(new Date(), config.timeZone), "00:00", config.timeZone).toISOString();
    const monthStart = zonedTimeToUtc(`${localDate(new Date(), config.timeZone).slice(0, 7)}-01`, "00:00", config.timeZone).toISOString();
    const ai = await pluginStore.get("ai");
    const prices = [ai?.config.priceIn, ai?.config.priceOut].map((value) => (value ?? "").trim());
    const price = prices.every((value) => value !== "" && Number.isFinite(Number(value))) ? { input: Number(prices[0]), output: Number(prices[1]) } : null;
    const today = usageLog.summary(dayStart);
    const month = usageLog.summary(monthStart);
    const twilio = await pluginStore.get("twilio");
    let account: Awaited<ReturnType<typeof fetchTwilioAccount>> | undefined;
    let accountError: string | undefined;
    if (twilio?.enabled) {
      try {
        account = await fetchTwilioAccount(twilio.config.accountSid ?? "", twilio.secrets.authToken ?? "");
      } catch (error) {
        const status = error instanceof Error ? error.message : "";
        accountError = status === "401" || status === "403" ? "Twilio rejected the Account SID or auth token." : "Could not read your Twilio account right now.";
      }
    }
    return json({ ok: true, data: {
      ai: { enabled: !!ai?.enabled, provider: ai?.config.provider ?? null, model: ai?.config.model ?? null, today, month, price, cost: price ? { today: estimateCostUsd(today, price), month: estimateCostUsd(month, price) } : null },
      twilio: { enabled: !!twilio?.enabled, callsToday: [...recentCalls.values()].filter((call) => call.startedAt >= dayStart).length, account, error: accountError }
    } }, 200, corsHeaders);
  }

  // Team logins (owner only): name + starting PIN; removing a login ends that person's sessions.
  if (pathname === "/api/users" && method === "GET") {
    return json({ ok: true, data: { owner: auth.ownerName(), staff: auth.listStaff() } }, 200, corsHeaders);
  }
  if (pathname === "/api/users" && method === "POST") {
    const body = await req.json().catch(() => ({})) as { name?: unknown; pin?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!name || name.length > 80) return json(toolFailure("INVALID_INPUT", "Name must be 1-80 characters", false, `users_${Date.now()}`), 400, corsHeaders);
    if (!/^\d{6,8}$/.test(pin)) return json(toolFailure("INVALID_INPUT", "PIN must be 6-8 digits", false, `users_${Date.now()}`), 400, corsHeaders);
    const created = await auth.createStaff(name, pin);
    if ("error" in created) return json(toolFailure("NAME_TAKEN", "Someone already logs in with that name", false, `users_${Date.now()}`), 409, corsHeaders);
    return json(toolSuccess({ id: created.id, name }, `users_${Date.now()}`), 201, corsHeaders);
  }
  const userMatch = /^\/api\/users\/([\w-]+)$/.exec(pathname);
  if (userMatch && method === "DELETE") {
    if (!auth.removeStaff(userMatch[1])) return json(toolFailure("NOT_FOUND", "No staff login with that id", false, `users_${Date.now()}`), 404, corsHeaders);
    return json(toolSuccess({ removed: userMatch[1] }, `users_${Date.now()}`), 200, corsHeaders);
  }

  // Plugins page. Secrets are write-only: the API says whether one is saved, never what it is.
  if (pathname === "/api/plugins" && method === "GET") {
    const list = await Promise.all(plugins.map(async (plugin) => {
      const record = await pluginStore.get(plugin.id);
      return {
        id: plugin.id, name: plugin.name, category: plugin.category, description: plugin.description, limits: plugin.limits,
        enabled: record?.enabled ?? false,
        fields: plugin.fields.map((field) => ({ ...field, value: field.secret ? "" : record?.config[field.key] ?? "", saved: field.secret ? Boolean(record?.secrets[field.key]) : undefined })),
        preview: plugin.preview?.(),
        status: plugin.status?.() ?? undefined
      };
    }));
    return json({ ok: true, data: { plugins: list } }, 200, corsHeaders);
  }
  // HITL inbox: open tasks first, with an overdue flag from the per-kind SLA.
  if (pathname === "/api/inbox" && method === "GET") {
    const now = Date.now();
    const tasks = inbox.list().map((task) => ({
      ...task,
      overdue: !task.closedAt && now - Date.parse(task.createdAt) > SLA_MINUTES[task.kind] * 60_000,
      slaMinutes: SLA_MINUTES[task.kind]
    }));
    return json({ ok: true, data: { tasks } }, 200, corsHeaders);
  }
  // System page health: counts and sizes only, no customer data.
  if (pathname === "/api/system" && method === "GET") {
    const now = Date.now();
    const dbPath = process.env.DATABASE_URL;
    const open = inbox.list().filter((task) => !task.closedAt);
    const deliveries = outbox.recent(100);
    const bookings = [...domainService.getStore().workOrders.values()];
    const zone = getBusinessConfig().timeZone;
    const dayStart = zonedTimeToUtc(localDate(new Date(), zone), "00:00", zone).toISOString();
    const phoneOn = !!(await pluginStore.get("twilio"))?.enabled;
    return json({ ok: true, data: {
      calls: { lineOn: phoneOn, today: phoneOn ? [...recentCalls.values()].filter((call) => call.startedAt >= dayStart).length : 0 },
      uptimeSeconds: Math.round(process.uptime()),
      database: { kind: dbPath ? "file" : "memory", sizeBytes: dbPath && existsSync(dbPath) ? statSync(dbPath).size : 0 },
      inbox: { open: open.length, overdue: open.filter((task) => now - Date.parse(task.createdAt) > SLA_MINUTES[task.kind] * 60_000).length },
      events: { pending: deliveries.filter((d) => d.status === "pending").length, dead: deliveries.filter((d) => d.status === "dead").length },
      bookings: { total: bookings.length, lastCreatedAt: bookings.map((b) => b.createdAt).sort().at(-1) ?? null }
    } }, 200, corsHeaders);
  }
  // Developer API keys (owner only). The key is returned once, when it is created; the list shows the last 4 characters.
  if (pathname === "/api/api-keys" && method === "GET") return json({ ok: true, data: { keys: apiKeys.list() } }, 200, corsHeaders);
  if (pathname === "/api/api-keys" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown; scope?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 60 || (body.scope !== "read" && body.scope !== "write")) {
      return json(toolFailure("INVALID_INPUT", "Give the key a name (up to 60 characters) and choose read or write access", false, `key_${Date.now()}`), 400, corsHeaders);
    }
    const { key, row } = apiKeys.create(name, body.scope as ApiKeyScope);
    return new Response(JSON.stringify({ ok: true, data: { key, ...row } }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  const revokeKey = /^\/api\/api-keys\/([\w-]+)$/.exec(pathname);
  if (revokeKey && method === "DELETE") {
    if (!apiKeys.revoke(revokeKey[1])) return json(toolFailure("NOT_FOUND", "No active key with that id", false, `key_${Date.now()}`), 404, corsHeaders);
    return json(toolSuccess({ revoked: revokeKey[1] }, `key_${Date.now()}`), 200, corsHeaders);
  }
  // Owner downloads one file with the whole business. It contains the plugin key file, so it is never cached.
  if (pathname === "/api/backup" && method === "GET") {
    const backup = createBackup(process.env.DATABASE_URL);
    if (!backup) return json(toolFailure("NO_DATABASE_FILE", "This server keeps its data in memory only, so there is nothing to back up", false, `backup_${Date.now()}`), 409, corsHeaders);
    return new Response(JSON.stringify(backup), { status: 200, headers: {
      ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="dispatchai-backup-${backup.createdAt.slice(0, 10)}.json"`
    } });
  }
  const closeMatch = /^\/api\/inbox\/([\w-]+)\/close$/.exec(pathname);
  if (closeMatch && method === "POST") {
    if (!inbox.close(closeMatch[1], user?.name ?? auth.ownerName() ?? "owner")) return json(toolFailure("NOT_FOUND", "No open task with that id", false, `inbox_${Date.now()}`), 404, corsHeaders);
    return json(toolSuccess({ closed: closeMatch[1] }, `inbox_${Date.now()}`), 200, corsHeaders);
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
      if (plugin.id === "tunnel") await syncTunnel();
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
      const member = raw as { id?: unknown; name?: unknown; skills?: unknown; hours?: unknown };
      const name = typeof member.name === "string" ? member.name.trim() : "";
      const skills = Array.isArray(member.skills) ? member.skills.filter((skill): skill is string => typeof skill === "string" && known.has(skill)) : [];
      const hours = member.hours == null ? undefined : WeekHoursSchema.safeParse(member.hours);
      return { id: typeof member.id === "string" ? member.id : undefined, name, skills, hours: hours?.success ? hours.data : undefined, badHours: hours ? !hours.success : false };
    });
    if (staff?.some((member) => member.badHours)) {
      return json(toolFailure("INVALID_INPUT", "A staff member's hours are not valid (use HH:MM and a closing time after opening)", false, `staff_${Date.now()}`), 400, corsHeaders);
    }
    if (!staff || staff.some((member) => !member.name || member.name.length > 80 || member.skills.length === 0)) {
      return json(toolFailure("INVALID_INPUT", "Each staff member needs a name and at least one service", false, `staff_${Date.now()}`), 400, corsHeaders);
    }
    const blocked = domainService.getStore().setStaff(staff.map(({ badHours, ...member }) => member), config.serviceZones);
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
      // True only while this install still runs on the fictional demo dataset. The web uses it
      // to show the "seeded demo data" and "Reset Demo" affordances, which mean nothing on a real install.
      demo: domainService.getStore().demo,
      templates: businessTemplates.map((t) => ({ templateId: t.templateId, name: t.name, kind: t.kind, services: t.services.map((service) => service.name) }))
    } }, 200, corsHeaders);
  }
  if (businessRoute && method === "PUT") {
    const body = await req.json().catch(() => ({})) as { templateId?: unknown; name?: unknown; market?: unknown; timeZone?: unknown; serviceZones?: unknown; services?: unknown; hours?: unknown; slotMinutes?: unknown; runsOn?: unknown; greeting?: unknown; agentName?: unknown; tone?: unknown };
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
      slotMinutes: body.slotMinutes ?? base.slotMinutes,
      runsOn: body.runsOn ?? current.runsOn,
      greeting: text(body.greeting) || base.greeting,
      agentName: text(body.agentName) ?? current.agentName,
      tone: body.tone ?? current.tone
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
    // Hours, slot length or zones may have changed. Staff cover every service area, so a new area must reach
    // the people already on the roster; setStaff also regenerates the future free slots.
    const store = domainService.getStore();
    store.setStaff([...store.technicians.values()].map((tech) => ({ id: tech.id, name: tech.name, skills: tech.skills, hours: tech.hours })), parsed.data.serviceZones);
    return json(toolSuccess({ config: parsed.data }, `biz_${Date.now()}`), 200, corsHeaders);
  }

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
    // Resetting restores the seeded demo dataset. A real install has no demo data to restore and
    // live bookings must not be wiped, so the endpoint refuses there.
    if (!domainService.getStore().demo) {
      return new Response(JSON.stringify(toolFailure("NOT_DEMO_INSTALL", "This install holds real data, so there is no demo dataset to restore.", false, `reset_${Date.now()}`)), {
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
    const jobs = jobRows();
    return new Response(JSON.stringify({ ok: true, data: { jobs } }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (method === "GET" && pathname === "/api/directory") {
    // The directory carries the demo flag: the web shows "seeded demo data" and "Reset Demo"
    // only while this install still runs on the fictional dataset.
    return new Response(JSON.stringify({ ok: true, data: getDirectory(domainService.getStore()) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (method === "GET" && pathname === "/api/notifications") {
    return new Response(JSON.stringify({ ok: true, data: { notifications: [...domainService.getStore().notifications].reverse() } }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Health
  if (method === "GET" && pathname === "/health") {
    return new Response(JSON.stringify({ status: "OK", service: "DispatchAI" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
