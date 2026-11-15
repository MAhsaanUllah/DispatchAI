import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ApiKeyStore } from "./api-keys.js";

// PBKDF2 (600k) per login is slow on purpose; give the suite room on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

describe("ApiKeyStore", () => {
  it("shows the key once, stores only a hash, and stops a revoked key at once", () => {
    const store = new ApiKeyStore();
    const { key, row } = store.create("Website form", "read");
    expect(key).toMatch(/^dsp_[\w-]{43}$/);
    expect(row.last4).toBe(key.slice(-4));
    expect(JSON.stringify(store.list())).not.toContain(key);
    expect(store.verify(key)?.name).toBe("Website form");
    expect(store.verify(`${key}x`)).toBeUndefined();
    expect(store.revoke(row.id)).toBe(true);
    expect(store.revoke(row.id)).toBe(false);
    expect(store.verify(key)).toBeUndefined();
    expect(store.list()[0].revokedAt).toBeDefined();
  });

  it("survives a restart on a real database file, and a revoked key stays revoked", () => {
    const dir = mkdtempSync(join(tmpdir(), "dispatchai-keys-"));
    try {
      const path = join(dir, "keys.sqlite");
      const first = new ApiKeyStore(path);
      const { key, row } = first.create("Website form", "write");
      const second = new ApiKeyStore(path);
      expect(second.verify(key)).toMatchObject({ name: "Website form", scope: "write", last4: key.slice(-4) });
      expect(second.revoke(row.id)).toBe(true);
      expect(new ApiKeyStore(path).verify(key)).toBeUndefined();
    } finally {
      // Windows keeps open SQLite files locked; a leftover temp folder is harmless.
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("records last use at most once a minute", () => {
    const store = new ApiKeyStore();
    const { key } = store.create("Zap", "write");
    const t0 = new Date("2026-11-14T10:00:00Z");
    expect(store.verify(key, t0)?.lastUsedAt).toBe(t0.toISOString());
    expect(store.verify(key, new Date(t0.getTime() + 5_000))?.lastUsedAt).toBe(t0.toISOString());
    const later = new Date(t0.getTime() + 61_000);
    expect(store.verify(key, later)?.lastUsedAt).toBe(later.toISOString());
  });
});

let handleRequest: (req: Request) => Promise<Response>;
let inboxTasks: () => { kind: string; title: string }[];
beforeAll(async () => {
  process.env.SETUP_TOKEN = "KEYS-TEST";
  const worker = await import("./worker.js");
  handleRequest = worker.handleRequest;
  inboxTasks = () => worker.inbox.list().filter((t) => !t.closedAt);
});

const call = async (path: string, init: RequestInit & { cookie?: string; bearer?: string } = {}) => {
  const res = await handleRequest(new Request(`http://localhost${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-session-id": "keys-test", ...(init.cookie ? { Cookie: init.cookie } : {}), ...(init.bearer ? { Authorization: `Bearer ${init.bearer}` } : {}) }
  }));
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any, cookie: (res.headers.get("Set-Cookie") ?? "").split(";")[0] };
};

describe("developer API", () => {
  let owner = "";
  let staff = "";
  let readKey = "";
  let writeKey = "";
  let writeKeyId = "";

  it("only the owner can create, list and revoke keys", async () => {
    await call("/api/setup", { method: "POST", body: JSON.stringify({ code: "KEYS-TEST", name: "Ayesha", pin: "482915" }) });
    owner = (await call("/api/auth/login", { method: "POST", body: JSON.stringify({ pin: "482915" }) })).cookie;
    await call("/api/users", { method: "POST", cookie: owner, body: JSON.stringify({ name: "Bilal", pin: "135790" }) });
    staff = (await call("/api/auth/login", { method: "POST", body: JSON.stringify({ name: "bilal", pin: "135790" }) })).cookie;

    for (const [path, method] of [["/api/api-keys", "GET"], ["/api/api-keys", "POST"], ["/api/api-keys/abc", "DELETE"]] as const) {
      expect((await call(path, { method, cookie: staff, body: method === "POST" ? JSON.stringify({ name: "x", scope: "read" }) : undefined })).status, `${method} ${path}`).toBe(403);
    }
    expect((await call("/api/api-keys", { method: "POST", cookie: owner, body: JSON.stringify({ name: "", scope: "read" }) })).status).toBe(400);
    expect((await call("/api/api-keys", { method: "POST", cookie: owner, body: JSON.stringify({ name: "x", scope: "admin" }) })).status).toBe(400);

    const read = await call("/api/api-keys", { method: "POST", cookie: owner, body: JSON.stringify({ name: "Website form", scope: "read" }) });
    expect(read.status).toBe(201);
    readKey = read.body.data.key;
    const write = await call("/api/api-keys", { method: "POST", cookie: owner, body: JSON.stringify({ name: "Zapier", scope: "write" }) });
    writeKey = write.body.data.key;
    writeKeyId = write.body.data.id;

    const list = await call("/api/api-keys", { cookie: owner });
    expect(list.body.data.keys).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toContain(readKey);
    expect(list.body.data.keys.map((k: any) => k.last4).sort()).toEqual([readKey.slice(-4), writeKey.slice(-4)].sort());
  });

  it("rejects a missing or unknown key, and a dashboard cookie is not an API key", async () => {
    expect((await call("/api/v1/bookings")).status).toBe(401);
    expect((await call("/api/v1/bookings", { bearer: "dsp_nope" })).status).toBe(401);
    expect((await call("/api/v1/bookings", { cookie: owner })).status).toBe(401);
  });

  it("a read key can read but not write, and the owner sees a task about it (once)", async () => {
    expect((await call("/api/v1/bookings", { bearer: readKey })).status).toBe(200);
    for (let i = 0; i < 3; i++) {
      const denied = await call("/api/v1/bookings", { method: "POST", bearer: readKey, body: JSON.stringify({}) });
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("FORBIDDEN");
    }
    expect((await call("/api/v1/bookings/wo_1001/cancel", { method: "POST", bearer: readKey, body: "{}" })).status).toBe(403);
    const blocked = inboxTasks().filter((t) => /read-only key/.test(t.title));
    expect(blocked).toHaveLength(1);
    expect(blocked[0].title).toContain("Website form");
  });

  it("a write key books, moves and cancels through the same service as a phone booking", async () => {
    const found = await call("/api/v1/customers/find", { method: "POST", bearer: writeKey, body: JSON.stringify({ phone: "5125550101" }) });
    expect(found.body.data.customer.id).toBe("cust_101");

    let slotId = "";
    for (let d = 1; d <= 10 && !slotId; d++) {
      const day = new Date(); day.setDate(day.getDate() + d);
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const free = await call(`/api/v1/free-times?serviceType=HVAC&serviceZone=Austin-South&date=${date}`, { bearer: readKey });
      slotId = free.body.data?.slots?.[0]?.slotId ?? "";
    }
    expect(slotId).not.toBe("");

    const booking = { customerId: "cust_101", propertyId: "prop_201", serviceType: "HVAC", issueSummary: "Booked by the API test", slotId };
    const noKey = await call("/api/v1/bookings", { method: "POST", bearer: writeKey, body: JSON.stringify(booking) });
    expect(noKey.status).toBe(400);
    const created = await call("/api/v1/bookings", { method: "POST", bearer: writeKey, body: JSON.stringify({ ...booking, idempotencyKey: "api-test-1" }) });
    expect(created.status).toBe(201);
    const id = created.body.data.workOrder.id;
    expect(created.body.data.workOrder.status).toBe("BOOKED");

    const again = await call("/api/v1/bookings", { method: "POST", bearer: writeKey, body: JSON.stringify({ ...booking, idempotencyKey: "api-test-1" }) });
    expect(again.body.data.workOrder.id).toBe(id);

    const listed = await call("/api/v1/bookings", { bearer: readKey });
    expect(listed.body.data.bookings.some((b: any) => b.id === id)).toBe(true);
    expect((await call("/api/jobs", { cookie: owner })).body.data.jobs.some((j: any) => j.id === id)).toBe(true);

    const cancelled = await call(`/api/v1/bookings/${id}/cancel`, { method: "POST", bearer: writeKey, body: JSON.stringify({ idempotencyKey: "api-test-2", reason: "test" }) });
    expect(cancelled.status).toBe(200);
    expect((await call(`/api/v1/bookings/wo_missing/cancel`, { method: "POST", bearer: writeKey, body: JSON.stringify({ idempotencyKey: "api-test-3" }) })).status).toBe(404);
    expect((await call("/api/v1/nothing", { bearer: writeKey })).status).toBe(404);
  });

  it("revoking a key stops it at once", async () => {
    expect((await call(`/api/api-keys/${writeKeyId}`, { method: "DELETE", cookie: owner })).status).toBe(200);
    expect((await call("/api/v1/bookings", { bearer: writeKey })).status).toBe(401);
    expect((await call(`/api/api-keys/${writeKeyId}`, { method: "DELETE", cookie: owner })).status).toBe(404);
  });
});
