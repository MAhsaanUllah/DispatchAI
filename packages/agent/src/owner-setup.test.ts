import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthStore, generateSetupCode } from "./auth-store.js";

// PBKDF2 with 600k iterations is slow on purpose; under a loaded machine the default 5 s can run out.
// The worker import in beforeAll gets the same headroom: a timed-out hook makes vitest skip these tests silently.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const dir = mkdtempSync(join(tmpdir(), "dispatchai-auth-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("AuthStore", () => {
  it("creates the owner once, survives a restart and never stores the PIN in plain text", async () => {
    const path = join(dir, "owner.sqlite");
    const first = new AuthStore(path);
    expect(first.hasOwner()).toBe(false);
    expect(await first.createOwner("Ayesha", "482915")).toBe(true);
    expect(await first.createOwner("Intruder", "111111")).toBe(false);
    first.close();

    const restarted = new AuthStore(path);
    expect(restarted.hasOwner()).toBe(true);
    expect(await restarted.verifyPin("482915")).toBe(true);
    expect(await restarted.verifyPin("482916")).toBe(false);
    restarted.close();
    expect(readFileSync(path).includes(Buffer.from("482915"))).toBe(false);
  });

  it("generates readable one-time codes", () => {
    const code = generateSetupCode();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(generateSetupCode()).not.toBe(code);
  });
});

describe("setup API", () => {
  let handleRequest: (req: Request) => Promise<Response>;
  beforeAll(async () => {
    process.env.SETUP_TOKEN = "TEST-CODE";
    ({ handleRequest } = await import("./worker.js"));
  });
  afterAll(() => {
    delete process.env.SETUP_TOKEN;
  });

  const post = (body: unknown) => handleRequest(new Request("http://localhost/api/setup", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }));
  const status = async () => ((await (await handleRequest(new Request("http://localhost/api/setup/status"))).json()) as { data: { needsSetup: boolean } }).data.needsSetup;

  it("rejects a wrong code, a weak PIN and a missing name before setup", async () => {
    expect(await status()).toBe(true);
    expect((await post({ code: "WRONG-CODE", name: "Ayesha", pin: "482915" })).status).toBe(403);
    expect((await post({ code: "TEST-CODE", name: "Ayesha", pin: "12345" })).status).toBe(400);
    expect((await post({ code: "TEST-CODE", name: "Ayesha", pin: "12ab56" })).status).toBe(400);
    expect((await post({ code: "TEST-CODE", name: " ", pin: "482915" })).status).toBe(400);
    expect(await status()).toBe(true);
  });

  it("creates the owner with the right code, then locks setup for good", async () => {
    expect((await post({ code: "test-code", name: "Ayesha", pin: "482915" })).status).toBe(201);
    expect(await status()).toBe(false);
    const again = await post({ code: "TEST-CODE", name: "Intruder", pin: "111111" });
    expect(again.status).toBe(403);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe("SETUP_LOCKED");
  });

  // Runs after setup above: an owner now exists, so the API is closed without a session.
  const call = (path: string, init: RequestInit = {}) => handleRequest(new Request(`http://localhost${path}`, init));
  const login = (pin: string, headers: Record<string, string> = {}) =>
    call("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ pin }) });
  const cookieOf = (res: Response) => (res.headers.get("Set-Cookie") ?? "").split(";")[0];

  it("closes the API without a session and opens it after PIN login, until logout", async () => {
    expect((await call("/api/jobs")).status).toBe(401);
    expect((await call("/api/chat", { method: "POST", body: "{}" })).status).toBe(401);

    const ok = await login("482915");
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).not.toMatch(/Secure/);
    const cookie = cookieOf(ok);

    expect((await call("/api/jobs", { headers: { Cookie: cookie } })).status).toBe(200);
    const me = (await (await call("/api/auth/me", { headers: { Cookie: cookie } })).json()) as { data: { authenticated: boolean; owner: string } };
    expect(me.data).toEqual({ authenticated: true, owner: "Ayesha", role: "owner" });

    expect((await call("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } })).status).toBe(200);
    expect((await call("/api/jobs", { headers: { Cookie: cookie } })).status).toBe(401);
  });

  it("marks the cookie Secure behind HTTPS", async () => {
    const res = await login("482915", { "x-forwarded-proto": "https" });
    expect(res.headers.get("Set-Cookie")).toMatch(/; Secure/);
  });

  it("locks login after 5 wrong PINs, even for the right PIN", async () => {
    for (let i = 0; i < 4; i++) expect((await login("000000")).status).toBe(401);
    expect((await login("000000")).status).toBe(429);
    expect((await login("482915")).status).toBe(429);
  });
});
