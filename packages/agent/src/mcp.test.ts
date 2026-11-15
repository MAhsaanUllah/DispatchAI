import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// PBKDF2 (600k) per login is slow on purpose; give the suite room on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let handleRequest: (req: Request) => Promise<Response>;
let openTasks: () => { title: string }[];
beforeAll(async () => {
  process.env.SETUP_TOKEN = "MCP-TEST";
  const worker = await import("./worker.js");
  handleRequest = worker.handleRequest;
  openTasks = () => worker.inbox.list().filter((t) => !t.closedAt);
});
afterEach(() => vi.useRealTimers());

const http = async (path: string, init: RequestInit & { cookie?: string; bearer?: string } = {}) => {
  const res = await handleRequest(new Request(`http://localhost${path}`, {
    ...init, headers: { "Content-Type": "application/json", "x-session-id": "mcp-test", ...(init.cookie ? { Cookie: init.cookie } : {}), ...(init.bearer ? { Authorization: `Bearer ${init.bearer}` } : {}) }
  }));
  return { status: res.status, headers: res.headers, body: (await res.json().catch(() => ({}))) as any, cookie: (res.headers.get("Set-Cookie") ?? "").split(";")[0] };
};
let nextId = 1;
const rpc = (bearer: string, method: string, params?: unknown) => http("/api/mcp", { method: "POST", bearer, body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }) });
const tool = async (bearer: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc(bearer, "tools/call", { name, arguments: args });
  const content = res.body.result?.content?.[0]?.text as string;
  return { isError: !!res.body.result?.isError, text: content, json: (() => { try { return JSON.parse(content); } catch { return undefined; } })(), raw: res };
};

describe("MCP endpoint", () => {
  let owner = "";
  let readKey = "";
  let writeKey = "";
  let otherWriteKey = "";

  it("needs a key, and answers the protocol handshake", async () => {
    await http("/api/setup", { method: "POST", body: JSON.stringify({ code: "MCP-TEST", name: "Ayesha", pin: "482915" }) });
    owner = (await http("/api/auth/login", { method: "POST", body: JSON.stringify({ pin: "482915" }) })).cookie;
    const make = async (name: string, scope: string) => (await http("/api/api-keys", { method: "POST", cookie: owner, body: JSON.stringify({ name, scope }) })).body.data.key as string;
    readKey = await make("Claude (read)", "read");
    writeKey = await make("Claude (write)", "write");
    otherWriteKey = await make("Another assistant", "write");

    const anon = await http("/api/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
    expect(anon.status).toBe(401);
    expect(anon.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect((await http("/api/mcp", { method: "POST", cookie: owner, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) })).status).toBe(401);
    expect((await http("/api/mcp", { bearer: readKey })).status).toBe(405);

    const init = await rpc(readKey, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.body.result).toMatchObject({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "dispatchai" } });
    expect((await rpc(readKey, "initialize", { protocolVersion: "1999-01-01" })).body.result.protocolVersion).toBe("2025-06-18");
    const note = await http("/api/mcp", { method: "POST", bearer: readKey, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(note.status).toBe(202);
    expect((await rpc(readKey, "nope")).body.error.code).toBe(-32601);
  });

  it("a read key sees only look-up tools and is refused write tools (with one inbox task)", async () => {
    const names = (await rpc(readKey, "tools/list")).body.result.tools.map((t: any) => t.name);
    expect(names).toEqual(["list_bookings", "get_booking", "find_customer", "free_times"]);
    for (let i = 0; i < 2; i++) {
      const denied = await tool(readKey, "propose_booking", { customerId: "cust_101", serviceType: "HVAC", issueSummary: "x", slotId: "s" });
      expect(denied.isError).toBe(true);
      expect(denied.text).toMatch(/^FORBIDDEN/);
    }
    expect(openTasks().filter((t) => /Claude \(read\)/.test(t.title))).toHaveLength(1);
    expect((await tool(readKey, "confirm", { proposalId: "x" })).text).toMatch(/^FORBIDDEN/);
    expect((await tool(readKey, "no_such_tool")).raw.body.error.code).toBe(-32602);
  });

  it("looks things up with a read key", async () => {
    const found = await tool(readKey, "find_customer", { phone: "5125550101" });
    expect(found.json.customer.id).toBe("cust_101");
    expect((await tool(readKey, "get_booking", { workOrderId: "wo_missing" })).text).toMatch(/WORK_ORDER_NOT_FOUND/);
    expect(Array.isArray((await tool(readKey, "list_bookings")).json.bookings)).toBe(true);
  });

  it("a change is two steps: nothing happens until confirm, and a proposal works once", async () => {
    expect((await rpc(writeKey, "tools/list")).body.result.tools.map((t: any) => t.name)).toContain("confirm");

    let slotId = "";
    for (let d = 1; d <= 10 && !slotId; d++) {
      const day = new Date(); day.setDate(day.getDate() + d);
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      slotId = (await tool(writeKey, "free_times", { serviceType: "HVAC", serviceZone: "Austin-South", date })).json?.slots?.[0]?.slotId ?? "";
    }
    expect(slotId).not.toBe("");

    const before = (await http("/api/jobs", { cookie: owner })).body.data.jobs.length;
    const proposal = await tool(writeKey, "propose_booking", { customerId: "cust_101", propertyId: "prop_201", serviceType: "HVAC", issueSummary: "Booked through MCP", slotId });
    expect(proposal.json.proposalId).toBeTruthy();
    expect(proposal.json.summary).toContain(slotId);
    expect((await http("/api/jobs", { cookie: owner })).body.data.jobs.length).toBe(before);

    expect((await tool(otherWriteKey, "confirm", { proposalId: proposal.json.proposalId })).text).toMatch(/^CONFIRMATION_REQUIRED/);
    const done = await tool(writeKey, "confirm", { proposalId: proposal.json.proposalId });
    expect(done.isError, done.text).toBe(false);
    const id = done.json.workOrder.id;
    expect((await http("/api/jobs", { cookie: owner })).body.data.jobs.some((j: any) => j.id === id)).toBe(true);
    expect((await tool(writeKey, "confirm", { proposalId: proposal.json.proposalId })).text).toMatch(/^CONFIRMATION_REQUIRED/);

    const cancel = await tool(writeKey, "propose_cancel", { workOrderId: id, reason: "test" });
    expect((await http("/api/jobs", { cookie: owner })).body.data.jobs.find((j: any) => j.id === id).status).toBe("BOOKED");
    const cancelled = await tool(writeKey, "confirm", { proposalId: cancel.json.proposalId });
    expect(cancelled.isError, cancelled.text).toBe(false);
    expect((await http("/api/jobs", { cookie: owner })).body.data.jobs.find((j: any) => j.id === id).status).toBe("CANCELLED");
  });

  it("a proposal expires after 5 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const proposal = await tool(writeKey, "propose_cancel", { workOrderId: "wo_1001" });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect((await tool(writeKey, "confirm", { proposalId: proposal.json.proposalId })).text).toMatch(/^CONFIRMATION_REQUIRED/);
  });
});
