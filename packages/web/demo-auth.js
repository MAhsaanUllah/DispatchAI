import { DurableObject } from "cloudflare:workers";

const agentOrigin = "https://dispatchai-agent.itsahsaanmughal.workers.dev";
const encoder = new TextEncoder();
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
const random = () => encode(crypto.getRandomValues(new Uint8Array(24)));
const cookie = (request, name) => request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const setCookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

async function mac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function seal(value, secret) {
  const payload = encode(encoder.encode(JSON.stringify(value)));
  return `${payload}.${await mac(payload, secret)}`;
}

async function unseal(value, secret) {
  if (!value || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const expected = encoder.encode(await mac(parts[0], secret));
  const actual = encoder.encode(parts[1]);
  if (actual.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  if (diff) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

async function verifiedGoogleEmail(idToken, clientId, nonce) {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  } catch { return null; }
  if (header.alg !== "RS256" || claims.aud !== clientId || claims.nonce !== nonce ||
      !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) ||
      claims.exp * 1000 <= Date.now() || claims.email_verified !== true || typeof claims.email !== "string") return null;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) return null;
  const { keys } = await response.json();
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  return valid ? claims.email.toLowerCase() : null;
}

function redeemDecision(invite, email, now) {
  if (!invite || !(invite.expiresAt > now)) return "expired";
  if (invite.email && invite.email !== email) return "bound";
  if (!Array.isArray(invite.redeemedBy)) return invite.used ? "used" : "ok"; // invites stored before multi-reviewer support
  if (invite.redeemedBy.includes(email)) return "already";
  const max = Number.isInteger(invite.maxRedemptions) ? invite.maxRedemptions : 10;
  return invite.redeemedBy.length >= max ? "full" : "ok";
}

export class DemoAccess extends DurableObject {
  async createInvite(email, expiresAt, maxRedemptions = 10) {
    if (await this.ctx.storage.get("invite")) return false;
    await this.ctx.storage.put("invite", { email, expiresAt, used: false, maxRedemptions, redeemedBy: [] });
    return true;
  }
  async redeemInvite(email) {
    const invite = await this.ctx.storage.get("invite");
    const decision = redeemDecision(invite, email, Date.now());
    if (decision !== "ok" && decision !== "already") return false;
    if (decision === "ok") {
      await this.ctx.storage.put("invite", { ...invite, used: true, maxRedemptions: invite.maxRedemptions ?? 10, redeemedBy: [...(invite.redeemedBy || []), email] });
    }
    return true;
  }
  async callsUsed() { return (await this.ctx.storage.get("callsUsed")) || 0; }
  async quota() {
    const active = await this.ctx.storage.get("activeCall");
    const remaining = active && active.expiresAt > Date.now() ? active.expiresAt - Date.now() : 0;
    return { callsUsed: await this.callsUsed(), activeCallRemainingMs: remaining };
  }
  async setCallsUsed(value) { await this.ctx.storage.put("callsUsed", value); }
  async clearActiveCall() { await this.ctx.storage.delete("activeCall"); }
  async beginCall(sessionId) {
    const active = await this.ctx.storage.get("activeCall");
    if (active && active.expiresAt > Date.now()) return "active";
    const used = await this.callsUsed();
    if (used >= 2) return "limit";
    await this.ctx.storage.put("activeCall", { sessionId, expiresAt: Date.now() + 20 * 60000 });
    await this.ctx.storage.put("callsUsed", used + 1);
    return "ok";
  }
  async endCall(sessionId) {
    const active = await this.ctx.storage.get("activeCall");
    if (active?.sessionId === sessionId) await this.ctx.storage.delete("activeCall");
  }
}

async function userSession(request, env) {
  const session = await unseal(cookie(request, "dispatch_session"), env.DEMO_SESSION_SECRET);
  return typeof session?.email === "string" ? session : null;
}

const personas = new Set(["south_hvac", "central_plumbing", "north_hvac"]);
const safeContext = (name, persona) => typeof name === "string" && name.trim().length > 0 && name.length <= 80 && personas.has(persona);

export async function handleDemoRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/auth/me" && request.method === "GET") {
    const session = await userSession(request, env);
    if (!session) return reply({ authenticated: false }, 401);
    const used = await env.DEMO_ACCESS.getByName(`email:${session.email}`).callsUsed();
    return reply({ authenticated: true, email: session.email, callsRemaining: Math.max(0, 2 - used), name: session.name || "", persona: session.persona || "" });
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    const response = reply({ ok: true });
    response.headers.set("Set-Cookie", setCookie("dispatch_session", "", 0));
    return response;
  }
  if (path === "/api/invites" && request.method === "POST") {
    if (!env.DEMO_ADMIN_SECRET || request.headers.get("x-demo-admin-secret") !== env.DEMO_ADMIN_SECRET) return reply({ error: "Unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Invalid email" }, 400);
    const maxRedemptions = Number.isInteger(body.maxRedemptions) && body.maxRedemptions >= 1 && body.maxRedemptions <= 25 ? body.maxRedemptions : 10;
    const invite = random();
    await env.DEMO_ACCESS.getByName(`invite:${invite}`).createInvite(email, Date.now() + 7 * 86400000, maxRedemptions);
    return reply({ url: `${url.origin}/?invite=${invite}`, maxRedemptions }, 201);
  }
  if (path === "/api/admin/quota" && request.method === "POST") {
    if (!env.DEMO_ADMIN_SECRET || request.headers.get("x-demo-admin-secret") !== env.DEMO_ADMIN_SECRET) return reply({ error: "Unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Invalid email" }, 400);
    const access = env.DEMO_ACCESS.getByName(`email:${email}`);
    if (Number.isInteger(body.callsUsed) && body.callsUsed >= 0) await access.setCallsUsed(body.callsUsed);
    if (body.clearActive === true) await access.clearActiveCall();
    return reply({ ok: true, email, ...await access.quota() });
  }
  if (path === "/api/auth/google" && request.method === "GET") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.DEMO_SESSION_SECRET || !url.searchParams.get("invite")) return reply({ error: "Demo login is not configured" }, 503);
    const state = random(), nonce = random();
    const name = url.searchParams.get("name"), persona = url.searchParams.get("persona");
    if (!safeContext(name, persona)) return reply({ error: "Choose a name and demo location first" }, 400);
    const flow = await seal({ state, nonce, invite: url.searchParams.get("invite"), name: name.trim(), persona, exp: Date.now() + 600000 }, env.DEMO_SESSION_SECRET);
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/api/auth/callback`, response_type: "code", scope: "openid email", state, nonce })) target.searchParams.set(key, value);
    const response = new Response(null, { status: 302, headers: { Location: target.toString() } });
    response.headers.set("Set-Cookie", setCookie("dispatch_oauth", flow, 600));
    return response;
  }
  if (path === "/api/auth/callback" && request.method === "GET") {
    const flow = await unseal(cookie(request, "dispatch_oauth"), env.DEMO_SESSION_SECRET);
    if (!flow || flow.state !== url.searchParams.get("state") || !url.searchParams.get("code")) return reply({ error: "Login expired" }, 401);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: url.searchParams.get("code"), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/api/auth/callback`, grant_type: "authorization_code" })
    });
    if (!tokenResponse.ok) return reply({ error: "Google login failed" }, 401);
    const tokens = await tokenResponse.json();
    const email = await verifiedGoogleEmail(tokens.id_token || "", env.GOOGLE_CLIENT_ID, flow.nonce);
    if (!email || !await env.DEMO_ACCESS.getByName(`invite:${flow.invite}`).redeemInvite(email)) return reply({ error: "Invite expired, fully used, or wrong Google account" }, 403);
    const session = await seal({ email, name: flow.name, persona: flow.persona, exp: Date.now() + 86400000 }, env.DEMO_SESSION_SECRET);
    const response = new Response(null, { status: 302, headers: { Location: `${url.origin}/?voice=1` } });
    response.headers.append("Set-Cookie", setCookie("dispatch_session", session, 86400));
    response.headers.append("Set-Cookie", setCookie("dispatch_oauth", "", 0));
    return response;
  }
  const session = await userSession(request, env);
  if (!session) return reply({ error: "Google login and private invite required" }, 401);
  if (path === "/api/demo/context" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!safeContext(body.name, body.persona)) return reply({ error: "Valid name and demo location required" }, 400);
    const updated = await seal({ email: session.email, name: body.name.trim(), persona: body.persona, exp: Date.now() + 86400000 }, env.DEMO_SESSION_SECRET);
    const response = reply({ ok: true });
    response.headers.set("Set-Cookie", setCookie("dispatch_session", updated, 86400));
    return response;
  }
  if (path === "/api/voice/session" && request.method === "POST") {
    if (!safeContext(session.name, session.persona) || !env.AGENT || !env.AGENT_INTERNAL_SECRET) return reply({ error: "Demo voice is not configured" }, 503);
    const voiceSessionId = random();
    const access = env.DEMO_ACCESS.getByName(`email:${session.email}`);
    const admission = await access.beginCall(voiceSessionId);
    if (admission === "active") return reply({ error: "A call is already active on this Google account. End it, then try again." }, 429);
    if (admission === "limit") return reply({ error: "Demo call limit reached: each Google account gets 2 calls." }, 429);
    const upstream = await env.AGENT.fetch(`${agentOrigin}/api/voice/session`, { method: "POST", headers: { "Content-Type": "application/json", "x-dispatch-secret": env.AGENT_INTERNAL_SECRET, "x-session-id": voiceSessionId }, body: JSON.stringify({ name: session.name, persona: session.persona }) });
    if (!upstream.ok) {
      await access.endCall(voiceSessionId);
      return reply({ error: "Voice connection unavailable", detail: (await upstream.text()).slice(0, 200) }, 502);
    }
    const data = await upstream.json();
    const voiceToolToken = await seal({ email: session.email, sessionId: voiceSessionId, persona: session.persona, exp: Date.now() + 20 * 60000 }, env.DEMO_SESSION_SECRET);
    return reply({ ok: true, data: { ...data.data, sessionId: voiceSessionId, voiceToolToken } });
  }
  if (path === "/api/voice/end" && request.method === "POST") {
    const voice = await unseal(request.headers.get("x-voice-session-token"), env.DEMO_SESSION_SECRET);
    if (!voice || voice.email !== session.email) return reply({ error: "Invalid voice session" }, 401);
    await env.DEMO_ACCESS.getByName(`email:${session.email}`).endCall(voice.sessionId);
    return reply({ ok: true });
  }
  if (path.startsWith("/api/voice/tools/") && request.method === "POST") {
    const voice = await unseal(request.headers.get("x-voice-session-token"), env.DEMO_SESSION_SECRET);
    if (!voice || voice.email !== session.email || voice.persona !== session.persona) return reply({ error: "Invalid voice session" }, 401);
    const body = await request.json().catch(() => ({}));
    const upstream = await env.AGENT.fetch(`${agentOrigin}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-dispatch-secret": env.AGENT_INTERNAL_SECRET, "x-session-id": voice.sessionId }, body: JSON.stringify({ persona: voice.persona, parameters: body.parameters || {}, conversation_id: body.conversation_id }) });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  if (["/api/jobs", "/api/directory"].includes(path) && request.method === "GET") {
    if (!env.AGENT_INTERNAL_SECRET) return reply({ error: "Cloud data connection not configured" }, 503);
    if (!env.AGENT) return reply({ error: "Cloud data connection not configured" }, 503);
    const upstream = await env.AGENT.fetch(`${agentOrigin}${path}`, { headers: { "x-dispatch-secret": env.AGENT_INTERNAL_SECRET } });
    if (!upstream.ok) return reply({ error: "Cloud data unavailable" }, 502);
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
  return reply({ error: "Not available on public demo" }, 404);
}
