import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isLoopback } from "./client-ip.js";
import { childEnv, Tunnel } from "./tunnel.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-tunnel-env-"));
const out = join(dir, "env.json");
const fake = join(dir, "fake.mjs");
writeFileSync(fake, `
import { writeFileSync } from "node:fs";
const e = process.env;
writeFileSync(${JSON.stringify(out)}, JSON.stringify({ master: e.MASTER_KEY ?? null, setup: e.SETUP_TOKEN ?? null, db: e.DATABASE_URL ?? null, resend: e.RESEND_API_KEY ?? null, token: e.TUNNEL_TOKEN ?? null, path: Boolean(e.PATH ?? e.Path) }));
setInterval(() => {}, 1000);
`);
let current: Tunnel | undefined;
afterEach(() => { current?.stop(); current = undefined; for (const name of ["MASTER_KEY", "SETUP_TOKEN", "DATABASE_URL", "RESEND_API_KEY"]) delete process.env[name]; });
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const until = async (check: () => boolean) => { const end = Date.now() + 8000; while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); };
const seen = () => { try { return JSON.parse(readFileSync(out, "utf8")); } catch { return null; } };

describe("what the tunnel program can see", () => {
  it("drops this app's secrets from the environment and adds only the tunnel token back", () => {
    const env = childEnv({ PATH: "/bin", HTTPS_PROXY: "http://proxy", MASTER_KEY: "m", SETUP_TOKEN: "s", RESEND_API_KEY: "r", N8N_EVENTS_SECRET: "e", DATABASE_URL: "d", Password: "p" }, "tunnel-token");
    expect(env).toEqual({ PATH: "/bin", HTTPS_PROXY: "http://proxy", TUNNEL_TOKEN: "tunnel-token" });
    expect(childEnv({ PATH: "/bin", TUNNEL_TOKEN: "stale" })).toEqual({ PATH: "/bin" });
  });

  it("really starts the program without MASTER_KEY, SETUP_TOKEN, the database path or API keys", async () => {
    Object.assign(process.env, { MASTER_KEY: "master-secret", SETUP_TOKEN: "setup-secret", DATABASE_URL: "/data/x.sqlite", RESEND_API_KEY: "re_secret" });
    const t = current = new Tunnel((args) => [process.execPath, [fake, ...args]]);
    t.start({ mode: "token", token: "eyJ-the-tunnel-token", publicUrl: "https://x.example.com", port: 8123 });
    await until(() => seen() !== null);
    expect(seen()).toEqual({ master: null, setup: null, db: null, resend: null, token: "eyJ-the-tunnel-token", path: true });
  });
});

describe("rate limits behind our own tunnel", () => {
  it("knows which connections are local", () => {
    for (const local of ["127.0.0.1", "127.0.0.5", "::1", "::ffff:127.0.0.1"]) expect(isLoopback(local), local).toBe(true);
    for (const remote of ["203.0.113.9", "10.0.0.2", "::ffff:10.0.0.2", undefined, ""]) expect(isLoopback(remote), String(remote)).toBe(false);
  });
});
