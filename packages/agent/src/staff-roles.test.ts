import { beforeAll, describe, expect, it, vi } from "vitest";

// PBKDF2 (600k) per login is slow on purpose; give the suite room on a busy machine.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let handleRequest: (req: Request) => Promise<Response>;
beforeAll(async () => {
  process.env.SETUP_TOKEN = "STAFF-TEST";
  ({ handleRequest } = await import("./worker.js"));
});

const call = async (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const res = await handleRequest(new Request(`http://localhost${path}`, {
    ...init, headers: { "Content-Type": "application/json", "x-session-id": "staff-test", ...(init.cookie ? { Cookie: init.cookie } : {}) }
  }));
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any, cookie: (res.headers.get("Set-Cookie") ?? "").split(";")[0] };
};
const login = (pin: string, name = "") => call("/api/auth/login", { method: "POST", body: JSON.stringify({ name, pin }) });

describe("staff logins and roles", () => {
  let owner = "";
  let staff = "";
  let staffId = "";

  it("owner adds a staff login; names must be unique, owner name included", async () => {
    expect((await call("/api/setup", { method: "POST", body: JSON.stringify({ code: "STAFF-TEST", name: "Ayesha", pin: "482915" }) })).status).toBe(201);
    owner = (await login("482915")).cookie;
    const added = await call("/api/users", { method: "POST", cookie: owner, body: JSON.stringify({ name: "Bilal", pin: "135790" }) });
    expect(added.status).toBe(201);
    staffId = added.body.data.id;
    expect((await call("/api/users", { method: "POST", cookie: owner, body: JSON.stringify({ name: "bilal", pin: "135790" }) })).status).toBe(409);
    expect((await call("/api/users", { method: "POST", cookie: owner, body: JSON.stringify({ name: "AYESHA", pin: "135790" }) })).status).toBe(409);
    expect((await call("/api/users", { method: "POST", cookie: owner, body: JSON.stringify({ name: "Sara", pin: "12" }) })).status).toBe(400);
  });

  it("staff logs in by name and gets the staff role", async () => {
    expect((await login("135790")).status).toBe(401); // no name = owner, wrong PIN
    const res = await login("135790", "bilal");
    expect(res.status).toBe(200);
    staff = res.cookie;
    expect((await call("/api/auth/me", { cookie: staff })).body.data).toMatchObject({ authenticated: true, owner: "Bilal", role: "staff" });
  });

  it("server blocks owner-only actions for staff, and allows daily work", async () => {
    for (const [path, method] of [["/api/plugins", "GET"], ["/api/plugins/n8n", "PUT"], ["/api/users", "GET"], ["/api/business", "PUT"], ["/api/staff", "PUT"], ["/api/reset", "POST"]] as const) {
      expect((await call(path, { method, cookie: staff, body: method === "GET" ? undefined : "{}" })).status, `${method} ${path}`).toBe(403);
    }
    for (const path of ["/api/jobs", "/api/inbox", "/api/directory", "/api/business"]) {
      expect((await call(path, { cookie: staff })).status, path).toBe(200);
    }
  });

  it("records the staff name when they close an inbox task", async () => {
    await call("/api/chat", { method: "POST", cookie: staff, body: JSON.stringify({ message: "please have a real person call me back" }) });
    const task = (await call("/api/inbox", { cookie: staff })).body.data.tasks.find((t: { kind: string }) => t.kind === "human");
    expect((await call(`/api/inbox/${task.id}/close`, { method: "POST", cookie: staff })).status).toBe(200);
    expect((await call("/api/inbox", { cookie: owner })).body.data.tasks.find((t: { id: string }) => t.id === task.id).closedBy).toBe("Bilal");
  });

  it("locks only the name that had too many wrong PINs", async () => {
    for (let i = 0; i < 4; i++) expect((await login("000000", "Bilal")).status).toBe(401);
    expect((await login("000000", "Bilal")).status).toBe(429);
    expect((await login("135790", "Bilal")).status).toBe(429);
    expect((await login("482915")).status).toBe(200);
  });

  it("removing a staff login ends their session", async () => {
    expect((await call(`/api/users/${staffId}`, { method: "DELETE", cookie: owner })).status).toBe(200);
    expect((await call("/api/jobs", { cookie: staff })).status).toBe(401);
    expect((await call(`/api/users/${staffId}`, { method: "DELETE", cookie: owner })).status).toBe(404);
  });
});
