import { afterAll, describe, expect, it } from "vitest";
import { clientIp } from "./client-ip.js";
import { handleRequest } from "./worker.js";

process.env.DISPATCH_LOCK_BEFORE_SETUP = "1";
afterAll(() => { delete process.env.DISPATCH_LOCK_BEFORE_SETUP; });

const call = (path: string, init: RequestInit = {}) => handleRequest(new Request(`http://localhost${path}`, init));

describe("before the owner finishes setup", () => {
  it("lets a stranger see only whether setup is needed, and nothing else", async () => {
    const status = await call("/api/setup/status");
    expect(status.status).toBe(200);
    expect(((await status.json()) as any).data.needsSetup).toBe(true);
    for (const path of ["/api/jobs", "/api/directory", "/api/plugins", "/api/backup", "/api/usage", "/api/system", "/api/inbox", "/api/business"]) {
      const res = await call(path);
      expect(res.status, path).toBe(403);
      expect(((await res.json()) as any).error.code).toBe("SETUP_REQUIRED");
    }
    expect((await call("/api/plugins/n8n", { method: "PUT", body: JSON.stringify({ values: { url: "http://evil.example" }, enabled: true }) })).status).toBe(403);
    expect((await call("/api/business", { method: "PUT", body: JSON.stringify({ name: "Hijacked" }) })).status).toBe(403);
  });

  it("still answers the health check", async () => {
    expect((await call("/health")).status).toBe(200);
  });
});

describe("who is calling", () => {
  it("uses the connection address, and only trusts X-Forwarded-For when a proxy you run is in front", () => {
    expect(clientIp("203.0.113.9", "198.51.100.7, 10.0.0.1", false)).toBe("203.0.113.9");
    expect(clientIp("172.18.0.2", "198.51.100.7, 10.0.0.1", true)).toBe("198.51.100.7");
    expect(clientIp("172.18.0.2", undefined, true)).toBe("172.18.0.2");
    expect(clientIp(undefined, undefined, false)).toBe("local");
  });
});
