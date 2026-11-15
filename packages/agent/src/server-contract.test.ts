import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { handleRequest } from "./worker.js";
import { serveStatic } from "./static.js";

const get = (path: string) => new Request(`http://localhost${path}`, { headers: { "x-session-id": "contract_session" } });

describe("single Node server contract", () => {
  it.each(["/health", "/api/jobs", "/api/directory", "/api/notifications", "/api/state"])("answers GET %s with 200 from the in-process service", async (path) => {
    const res = await handleRequest(get(path));
    expect(res.status).toBe(200);
  });

  it("returns seeded jobs and the configured company without a separate domain server", async () => {
    const jobs = await (await handleRequest(get("/api/jobs"))).json() as { ok: boolean; data: { jobs: unknown[] } };
    expect(jobs.ok).toBe(true);
    expect(jobs.data.jobs.length).toBeGreaterThan(0);
    const directory = await (await handleRequest(get("/api/directory"))).json() as { data: { company: { name: string } } };
    expect(directory.data.company.name).toBe("Austin Metro Service Dispatch");
  });
});

describe("dashboard static files", () => {
  const parent = mkdtempSync(join(tmpdir(), "dispatchai-web-"));
  const root = join(parent, "dist");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<html>dashboard</html>");
  writeFileSync(join(root, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(parent, "secret.txt"), "do not serve");
  afterAll(() => rmSync(parent, { recursive: true, force: true }));

  it("serves index.html for SPA routes and assets with a content type", async () => {
    const page = await serveStatic(get("/app"), root);
    expect(page?.status).toBe(200);
    expect(await page?.text()).toContain("dashboard");
    const asset = await serveStatic(get("/assets/app.js"), root);
    expect(asset?.headers.get("Content-Type")).toContain("javascript");
  });

  it("leaves API routes to the API handler", async () => {
    expect(await serveStatic(get("/api/jobs"), root)).toBeNull();
    expect(await serveStatic(get("/health"), root)).toBeNull();
  });

  it("blocks path traversal outside the dashboard folder", async () => {
    // URL parsing already removes plain "../"; an encoded slash survives it and reaches the guard.
    const res = await serveStatic(get("/..%2Fsecret.txt"), root);
    expect(res?.status).toBe(404);
    expect(await res?.text()).not.toContain("do not serve");
  });

  it("returns 404 for a missing asset instead of the SPA page", async () => {
    expect((await serveStatic(get("/assets/missing.js"), root))?.status).toBe(404);
  });
});
