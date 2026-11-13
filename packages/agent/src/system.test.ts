import { describe, expect, it } from "vitest";
import { handleRequest } from "./worker.js";

describe("GET /api/system", () => {
  it("reports health counts and no customer data", async () => {
    const res = await handleRequest(new Request("http://localhost/api/system", { headers: { "x-session-id": "owner" } }));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as any;
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(["file", "memory"]).toContain(data.database.kind);
    expect(data.inbox).toEqual({ open: expect.any(Number), overdue: expect.any(Number) });
    expect(data.events).toEqual({ pending: expect.any(Number), dead: expect.any(Number) });
    expect(data.bookings.total).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(data)).not.toMatch(/phone|email|address|name/i);
  });
});
