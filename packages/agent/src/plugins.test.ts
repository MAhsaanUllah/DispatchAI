import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyEventSignature } from "@dispatchai/shared";
import { PluginStore } from "./plugin-store.js";
import { handleRequest } from "./worker.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-plugins-"));
const SECRET = "n8n-signing-secret-1234567890";

describe("PluginStore", () => {
  it("encrypts secrets at rest and needs the right master key to read them", async () => {
    const path = join(dir, "plugins.sqlite");
    await new PluginStore(path, "master-one").save("n8n", { enabled: true, config: { url: "http://n8n:5678/hook" }, secrets: { secret: SECRET } });
    expect(readFileSync(path).includes(Buffer.from(SECRET))).toBe(false);
    expect((await new PluginStore(path, "master-one").get("n8n"))?.secrets.secret).toBe(SECRET);
    const wrongKey = await new PluginStore(path, "master-two").get("n8n");
    expect(wrongKey).toEqual({ enabled: false, config: { url: "http://n8n:5678/hook" }, secrets: {} });
  });
});

describe("plugins API", () => {
  const received: { body: string; headers: Record<string, string | string[] | undefined> }[] = [];
  let server: Server;
  let url = "";
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ body, headers: req.headers });
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/hook`;
  });
  afterAll(() => {
    server.close();
    // Windows keeps open SQLite files locked; a leftover temp folder is harmless.
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const call = async (path: string, init: RequestInit = {}) => {
    const res = await handleRequest(new Request(`http://localhost${path}`, { headers: { "Content-Type": "application/json", "x-session-id": "plugins" }, ...init }));
    return { status: res.status, body: (await res.json()) as any };
  };
  const save = (values: object, enabled = true) => call("/api/plugins/n8n", { method: "PUT", body: JSON.stringify({ values, enabled }) });

  it("lists built-in plugins, not connected", async () => {
    const { body } = await call("/api/plugins");
    expect(body.data.plugins.map((p: { id: string }) => p.id)).toEqual(["n8n", "email", "ai", "reminders", "twilio", "tunnel"]);
    expect(body.data.plugins[0].enabled).toBe(false);
  });

  it("validates before enabling and never returns the secret", async () => {
    expect((await save({ url: "ftp://x", secret: SECRET })).status).toBe(400);
    expect((await save({ url, secret: "short" })).status).toBe(400);
    expect((await save({ url, secret: SECRET })).status).toBe(200);
    const listed = JSON.stringify((await call("/api/plugins")).body);
    expect(listed).not.toContain(SECRET);
    const field = (await call("/api/plugins")).body.data.plugins[0].fields.find((f: { key: string }) => f.key === "secret");
    expect(field).toMatchObject({ value: "", saved: true });
  });

  it("keeps the saved secret when the field is left empty, and Test sends a signed ping", async () => {
    expect((await save({ url, secret: "" })).status).toBe(200);
    const test = await call("/api/plugins/n8n/test", { method: "POST" });
    expect(test.body.data.ok).toBe(true);
    const ping = received.at(-1)!;
    expect(ping.headers["x-dispatchai-event"]).toBe("test.ping");
    expect(await verifyEventSignature(ping.body, String(ping.headers["x-dispatchai-timestamp"]), String(ping.headers["x-dispatchai-signature"]), SECRET)).toBe(true);
  });

  it("reports an unreachable URL in plain words", async () => {
    await save({ url: "http://127.0.0.1:1/down", secret: "" });
    const test = await call("/api/plugins/n8n/test", { method: "POST" });
    expect(test.body.data).toEqual({ ok: false, message: expect.stringMatching(/Could not reach/) });
    await save({ url, secret: "" });
  });

  it("delivers booking events through the plugin settings, and stops when disabled", async () => {
    const chat = (message: string) => call("/api/chat", { method: "POST", body: JSON.stringify({ message }) });
    const before = received.length;
    await chat("5125550101");
    await chat("1402 South Congress Ave");
    await chat("My AC is blowing warm air, can you send someone tomorrow?");
    await chat(`Please book ${(await call("/api/state")).body.availableSlots[0].slotId}`);
    expect((await chat("yes")).body.reply).toMatch(/confirmed/i);
    for (let i = 0; i < 40 && received.length === before; i++) await new Promise((r) => setTimeout(r, 50));
    expect(received.at(-1)!.headers["x-dispatchai-event"]).toBe("booking.created");

    expect((await save({}, false)).status).toBe(200);
    expect((await call("/api/plugins")).body.data.plugins[0].enabled).toBe(false);
  });

  it("404s an unknown plugin", async () => {
    expect((await call("/api/plugins/telepathy", { method: "PUT", body: "{}" })).status).toBe(404);
  });
});
