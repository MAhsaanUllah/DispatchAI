import { beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe("change PIN from the dashboard", () => {
  let handleRequest: (req: Request) => Promise<Response>;
  beforeAll(async () => { process.env.SETUP_TOKEN = "PIN-TEST"; ({ handleRequest } = await import("./worker.js")); });
  const call = async (path: string, method: string, body?: unknown, cookie = "") => {
    const res = await handleRequest(new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json", "x-client-ip": "198.51.100.77", ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, cookie: (res.headers.get("Set-Cookie") ?? "").split(";")[0], json: await res.json().catch(() => ({})) as { data?: { id?: string; authenticated?: boolean } } };
  };
  it("owner changes own PIN (needs current) and resets a staff PIN", async () => {
    await call("/api/setup", "POST", { code: "PIN-TEST", name: "Ayesha", pin: "482915" });
    const owner = (await call("/api/auth/login", "POST", { pin: "482915" })).cookie;
    const staff = await call("/api/users", "POST", { name: "Bilal", pin: "135790" }, owner);
    const id = staff.json.data!.id!;
    expect((await call("/api/users/owner/pin", "PUT", { current: "000000", pin: "246810" }, owner)).status).toBe(403);
    expect((await call("/api/users/owner/pin", "PUT", { current: "482915", pin: "246810" }, owner)).status).toBe(200);
    expect((await call("/api/auth/login", "POST", { pin: "482915" })).status).toBe(401);
    expect((await call("/api/auth/login", "POST", { pin: "246810" })).status).toBe(200);
    const bilal = (await call("/api/auth/login", "POST", { name: "Bilal", pin: "135790" })).cookie;
    expect((await call(`/api/users/${id}/pin`, "PUT", { pin: "97531" }, owner)).status).toBe(400);
    expect((await call(`/api/users/${id}/pin`, "PUT", { pin: "975310" }, owner)).status).toBe(200);
    expect((await call("/api/auth/me", "GET", undefined, bilal)).json.data?.authenticated).toBe(false);
    const again = await call("/api/auth/login", "POST", { name: "Bilal", pin: "975310" });
    expect(again.status).toBe(200);
    expect((await call(`/api/users/${id}/pin`, "PUT", { pin: "111222" }, again.cookie)).status).toBe(403);
  });
});
