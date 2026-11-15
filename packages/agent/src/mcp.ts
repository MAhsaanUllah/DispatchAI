import { randomUUID } from "node:crypto";
import { toolFailure, type ToolResult } from "@dispatchai/shared";
import type { ApiV1Deps } from "./api-v1.js";

// MCP (Model Context Protocol) over plain HTTP: JSON-RPC 2.0 in, JSON out, no streaming and no sessions.
// The same Bearer keys as the developer API: a read key gets look-up tools, a write key may also propose changes.
// A change is two steps on purpose: propose_* returns a summary and a proposal id, and only confirm applies it.
export type McpDeps = ApiV1Deps & { proposals?: Map<string, Proposal> };
type Proposal = { keyId: string; summary: string; expiresAt: number; run: (cid: string) => Promise<ToolResult<unknown>> };

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const PROPOSAL_MS = 5 * 60_000;
const proposalsFallback = new Map<string, Proposal>();

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const str = (description: string) => ({ type: "string", description });
const READ_TOOLS = [
  { name: "list_bookings", description: "List this business's bookings, optionally for one date (YYYY-MM-DD).", inputSchema: obj({ date: str("Only bookings starting on this local date, YYYY-MM-DD") }) },
  { name: "get_booking", description: "Get one booking by its id, for example wo_1001.", inputSchema: obj({ workOrderId: str("Booking id") }, ["workOrderId"]) },
  { name: "find_customer", description: "Find a customer and their properties by phone number.", inputSchema: obj({ phone: str("Phone number") }, ["phone"]) },
  { name: "free_times", description: "List free appointment slots for a service, zone and date.", inputSchema: obj({ serviceType: str("Service id, for example HVAC"), serviceZone: str("Service zone or location name"), date: str("YYYY-MM-DD") }, ["serviceType", "serviceZone", "date"]) }
];
const WRITE_TOOLS = [
  { name: "propose_booking", description: "Propose a new booking. Nothing is booked until confirm is called with the returned proposalId. Ask the owner for an explicit yes first.", inputSchema: obj({ customerId: str("Customer id"), propertyId: str("Property id (omit for in-store businesses)"), serviceType: str("Service id"), issueSummary: str("What the job is"), slotId: str("A slot id from free_times") }, ["customerId", "serviceType", "issueSummary", "slotId"]) },
  { name: "propose_reschedule", description: "Propose moving a booking to another slot. Applied only by confirm after an explicit yes from the owner.", inputSchema: obj({ workOrderId: str("Booking id"), newSlotId: str("A slot id from free_times") }, ["workOrderId", "newSlotId"]) },
  { name: "propose_cancel", description: "Propose cancelling a booking. Applied only by confirm after an explicit yes from the owner.", inputSchema: obj({ workOrderId: str("Booking id"), reason: str("Optional reason") }, ["workOrderId"]) },
  { name: "confirm", description: "Apply a proposal. Call this only after the owner has clearly said yes to exactly that proposal. A proposal works once and expires after 5 minutes.", inputSchema: obj({ proposalId: str("The proposalId returned by a propose_* tool") }, ["proposalId"]) }
];

export async function handleMcp(req: Request, d: McpDeps): Promise<Response> {
  const proposals = d.proposals ?? proposalsFallback;
  const http = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { ...d.cors, ...(body === undefined ? {} : { "Content-Type": "application/json" }), "Cache-Control": "no-store", ...extra } });
  const rpcError = (id: unknown, code: number, message: string) => http({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  if (req.method !== "POST") return http(undefined, 405, { Allow: "POST" });
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const key = bearer ? d.keys.verify(bearer) : undefined;
  if (!key) return http({ ok: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid key" } }, 401, { "WWW-Authenticate": "Bearer" });
  if (!d.allow(`key:${key.id}`)) return http({ ok: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" } }, 429);

  const message = (await req.json().catch(() => undefined)) as { jsonrpc?: string; id?: unknown; method?: string; params?: any } | undefined;
  if (!message || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") return rpcError(undefined, -32600, "Send one JSON-RPC 2.0 request");
  const { id, method, params } = message;
  const isNotification = id === undefined;
  const reply = (result: unknown) => (isNotification ? http(undefined, 202) : http({ jsonrpc: "2.0", id, result }));

  if (method === "initialize") {
    const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
    return reply({
      protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: "dispatchai", version: "1.0.0" },
      instructions: key.scope === "write"
        ? "Bookings for one business. To change anything, call a propose_* tool, tell the owner exactly what will happen, and call confirm only after an explicit yes."
        : "Read-only access to one business's bookings, customers and free times."
    });
  }
  if (method.startsWith("notifications/")) return http(undefined, 202);
  if (method === "ping") return reply({});
  if (method === "tools/list") return reply({ tools: key.scope === "write" ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS });
  if (method !== "tools/call") return rpcError(id, -32601, `Method not found: ${method}`);

  const name = String(params?.name ?? "");
  const args = (params?.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
  const text = (value: unknown, isError = false) => reply({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }], isError });
  const result = (r: ToolResult<unknown>) => (r.ok ? text(r.data) : text(`${r.error.code}: ${r.error.message}`, true));
  const cid = `mcp_${key.id.slice(0, 8)}_${Date.now()}`;
  const s = (field: string) => (typeof args[field] === "string" ? (args[field] as string) : "");

  const isWrite = WRITE_TOOLS.some((t) => t.name === name);
  if (!isWrite && !READ_TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
  if (isWrite && key.scope !== "write") {
    d.inbox.add("delivery_failed", key.id, `Blocked: "${key.name}" tried to change bookings with a read-only key`, `The key ending ${key.last4} can only read. Create a read-and-book key if this was meant.`);
    return text("FORBIDDEN: this connection is read only", true);
  }

  switch (name) {
    case "list_bookings": {
      const date = s("date");
      const rows = d.bookings() as { scheduledStart?: string }[];
      return text({ bookings: date ? rows.filter((r) => r.scheduledStart?.startsWith(date)) : rows });
    }
    case "get_booking": return result(toolFailureOrFound(d.bookings() as { id: string }[], s("workOrderId"), cid));
    case "find_customer": return result(await d.client.findCustomer({ phone: s("phone") }, cid));
    case "free_times": return result(await d.client.checkAvailability({ serviceType: s("serviceType"), serviceZone: s("serviceZone"), date: s("date") }, cid));
    case "propose_booking": return propose(`Book ${s("serviceType")} for customer ${s("customerId")} in slot ${s("slotId")}: "${s("issueSummary")}"`, (c, pid) =>
      d.client.createWorkOrder({ urgency: "STANDARD", customerId: s("customerId"), propertyId: s("propertyId") || undefined, serviceType: s("serviceType"), issueSummary: s("issueSummary"), slotId: s("slotId"), createdBy: "HUMAN", idempotencyKey: `mcp-${pid}` } as never, c));
    case "propose_reschedule": return propose(`Move booking ${s("workOrderId")} to slot ${s("newSlotId")}`, (c, pid) =>
      d.client.rescheduleWorkOrder({ workOrderId: s("workOrderId"), newSlotId: s("newSlotId"), idempotencyKey: `mcp-${pid}` }, c));
    case "propose_cancel": return propose(`Cancel booking ${s("workOrderId")}${s("reason") ? ` (${s("reason")})` : ""}`, (c, pid) =>
      d.client.cancelWorkOrder({ workOrderId: s("workOrderId"), reason: s("reason") || undefined, idempotencyKey: `mcp-${pid}` }, c));
    case "confirm": {
      const found = proposals.get(s("proposalId"));
      if (found && found.expiresAt < Date.now()) proposals.delete(s("proposalId"));
      // One shared answer for unknown, expired, used and someone else's proposal. Another key's attempt must not remove it.
      if (!found || found.keyId !== key.id || found.expiresAt < Date.now()) return text("CONFIRMATION_REQUIRED: no open proposal with that id. Propose again and get a fresh yes.", true);
      proposals.delete(s("proposalId"));
      return result(await found.run(cid));
    }
  }
  return rpcError(id, -32602, `Unknown tool: ${name}`);

  function propose(summary: string, run: (cid: string, proposalId: string) => Promise<ToolResult<unknown>>) {
    for (const [pid, p] of proposals) if (p.expiresAt < Date.now()) proposals.delete(pid);
    const proposalId = randomUUID();
    proposals.set(proposalId, { keyId: key!.id, summary, expiresAt: Date.now() + PROPOSAL_MS, run: (c) => run(c, proposalId) });
    return text({ proposalId, summary, expiresInSeconds: PROPOSAL_MS / 1000, next: "Tell the owner exactly this and call confirm only after an explicit yes." });
  }
}

function toolFailureOrFound(rows: { id: string }[], id: string, cid: string): ToolResult<unknown> {
  const row = rows.find((r) => r.id === id);
  return row ? { ok: true, data: { booking: row }, correlationId: cid } as ToolResult<unknown> : toolFailure("WORK_ORDER_NOT_FOUND", `No booking ${id}`, false, cid);
}
