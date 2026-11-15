import { beforeAll, describe, expect, it, vi } from "vitest";

// PBKDF2 (600k) per login is slow on purpose; give the suite room on a busy machine.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let handleRequest: (req: Request) => Promise<Response>;
beforeAll(async () => {
  process.env.SETUP_TOKEN = "RATE-TEST";
  ({ handleRequest } = await import("./worker.js"));
});

const call = async (path: string, init: RequestInit & { cookie?: string; ip?: string } = {}) => {
  const res = await handleRequest(new Request(`http://localhost${path}`, {
    ...init, headers: { "Content-Type": "application/json", "x-session-id": "rate-test", "x-client-ip": init.ip ?? "203.0.113.10", ...(init.cookie ? { Cookie: init.cookie } : {}) }
  }));
  return { status: res.status, cookie: (res.headers.get("Set-Cookie") ?? "").split(";")[0] };
};
const burst = async (n: number, make: (i: number) => Promise<{ status: number }>) => {
  let limited = 0;
  for (let i = 0; i < n; i++) if ((await make(i)).status === 429) limited++;
  return limited;
};

// One open dashboard tab polls about 45 times a minute (measured), and a whole shop can sit behind one public address.
describe("rate limits", () => {
  let owner = "";
  let staff = "";

  it("a visitor without a login is limited per address (120 a minute)", async () => {
    await call("/api/setup", { method: "POST", ip: "198.51.100.1", body: JSON.stringify({ code: "RATE-TEST", name: "Ayesha", pin: "482915" }) });
    owner = (await call("/api/auth/login", { method: "POST", ip: "198.51.100.2", body: JSON.stringify({ pin: "482915" }) })).cookie;
    await call("/api/users", { method: "POST", cookie: owner, ip: "198.51.100.2", body: JSON.stringify({ name: "Bilal", pin: "135790" }) });
    staff = (await call("/api/auth/login", { method: "POST", ip: "198.51.100.3", body: JSON.stringify({ name: "bilal", pin: "135790" }) })).cookie;
    expect(owner).toContain("dispatch_owner=");

    expect(await burst(130, () => call("/api/setup/status", { ip: "203.0.113.50" }))).toBeGreaterThan(0);
    expect((await call("/api/setup/status", { ip: "203.0.113.51" })).status).toBe(200);
  });

  it("changing the cookie does not buy a new allowance", async () => {
    expect(await burst(130, (i) => call("/api/auth/me", { ip: "203.0.113.60", cookie: `dispatch_owner=fake-${i}` }))).toBeGreaterThan(0);
  });

  it("logged-in people each get their own allowance, even behind the same address", async () => {
    // The shared address already used up its allowance above.
    expect((await call("/api/setup/status", { ip: "203.0.113.50" })).status).toBe(429);
    expect(await burst(250, () => call("/api/auth/me", { ip: "203.0.113.50", cookie: owner }))).toBe(0);
    expect(await burst(250, () => call("/api/auth/me", { ip: "203.0.113.50", cookie: staff }))).toBe(0);
  });

  it("a session is still capped (600 a minute) so a stuck script cannot hammer the server", async () => {
    expect(await burst(650, () => call("/api/auth/me", { ip: "203.0.113.70", cookie: owner }))).toBeGreaterThan(0);
  });
});
