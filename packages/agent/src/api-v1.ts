import { toolFailure, type ToolResult } from "@dispatchai/shared";
import type { ApiKeyStore } from "./api-keys.js";
import type { N8nClient } from "./client.js";
import type { Inbox } from "./inbox.js";

export type ApiV1Deps = {
  keys: ApiKeyStore;
  client: Pick<N8nClient, "createCaller" | "findCustomer" | "checkAvailability" | "createWorkOrder" | "rescheduleWorkOrder" | "cancelWorkOrder">;
  bookings: () => unknown[];
  inbox: Inbox;
  allow: (key: string) => boolean;
  cors: Record<string, string>;
};

const status = (result: ToolResult<unknown>, created = false) => {
  if (result.ok) return created ? 201 : 200;
  const code = result.error.code;
  return /NOT_FOUND/.test(code) ? 404 : /CONFLICT|EXISTS/.test(code) ? 409 : 400;
};

// Developer API for this one business. Bearer key auth; a write is a direct staff-style action, so it does not need the
// caller's spoken yes, but it goes through the same service layer, emails and n8n events as a phone booking.
export async function handleApiV1(req: Request, d: ApiV1Deps): Promise<Response> {
  const respond = (body: unknown, code: number) => new Response(JSON.stringify(body), { status: code, headers: { ...d.cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const fail = (code: string, message: string, http: number) => respond(toolFailure(code, message, false, `v1_${Date.now()}`), http);

  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const key = bearer ? d.keys.verify(bearer) : undefined;
  if (!key) return fail("UNAUTHORIZED", "Missing or invalid API key", 401);
  if (!d.allow(`key:${key.id}`)) return fail("RATE_LIMIT_EXCEEDED", "Too many requests. Please wait before retrying.", 429);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1/, "") || "/";
  const method = req.method;
  const cid = `v1_${key.id.slice(0, 8)}_${Date.now()}`;
  const readOnly = () => {
    if (key.scope === "write") return undefined;
    // One open task per key (the inbox de-duplicates), so a misbehaving script cannot flood it.
    d.inbox.add("delivery_failed", key.id, `Blocked: "${key.name}" tried to change bookings with a read-only key`, `The key ending ${key.last4} can only read. Create a read-and-book key if this was meant.`);
    return fail("FORBIDDEN", "This key is read only", 403);
  };
  const body = async (): Promise<Record<string, unknown> | undefined> => {
    const parsed = await req.json().catch(() => undefined);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  };
  const idem = (b: Record<string, unknown>) => (typeof b.idempotencyKey === "string" && b.idempotencyKey) || req.headers.get("idempotency-key") || undefined;

  if (method === "GET" && path === "/bookings") return respond({ ok: true, data: { bookings: d.bookings() } }, 200);

  if (method === "GET" && path === "/free-times") {
    const result = await d.client.checkAvailability({ serviceType: url.searchParams.get("serviceType") ?? "", serviceZone: url.searchParams.get("serviceZone") ?? "", date: url.searchParams.get("date") ?? "" }, cid);
    return respond(result, status(result));
  }

  if (method === "POST" && path === "/customers/find") {
    const b = await body();
    if (!b) return fail("INVALID_INPUT", "Send a JSON object", 400);
    const result = await d.client.findCustomer({ phone: String(b.phone ?? "") }, cid);
    return respond(result, status(result));
  }

  if (method === "POST" && path === "/customers") {
    const denied = readOnly(); if (denied) return denied;
    const b = await body();
    if (!b) return fail("INVALID_INPUT", "Send a JSON object", 400);
    const result = await d.client.createCaller({ name: String(b.name ?? ""), phone: String(b.phone ?? ""), addressLine1: typeof b.addressLine1 === "string" ? b.addressLine1 : undefined, serviceZone: typeof b.serviceZone === "string" ? b.serviceZone : undefined }, cid);
    return respond(result, status(result, true));
  }

  if (method === "POST" && path === "/bookings") {
    const denied = readOnly(); if (denied) return denied;
    const b = await body();
    if (!b) return fail("INVALID_INPUT", "Send a JSON object", 400);
    const result = await d.client.createWorkOrder({ urgency: "STANDARD", ...b, createdBy: "HUMAN", idempotencyKey: idem(b) ?? "" } as never, cid);
    return respond(result, status(result, true));
  }

  const change = /^\/bookings\/([\w-]+)\/(reschedule|cancel)$/.exec(path);
  if (method === "POST" && change) {
    const denied = readOnly(); if (denied) return denied;
    const b = await body();
    if (!b) return fail("INVALID_INPUT", "Send a JSON object", 400);
    const base = { workOrderId: change[1], idempotencyKey: idem(b) ?? "" };
    const result = change[2] === "reschedule"
      ? await d.client.rescheduleWorkOrder({ ...base, newSlotId: String(b.newSlotId ?? "") }, cid)
      : await d.client.cancelWorkOrder({ ...base, reason: typeof b.reason === "string" ? b.reason : undefined }, cid);
    return respond(result, status(result));
  }

  return fail("NOT_FOUND", "No such endpoint", 404);
}
