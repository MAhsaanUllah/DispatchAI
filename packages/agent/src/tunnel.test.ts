import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Tunnel } from "./tunnel.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-tunnel-"));
const out = join(dir, "seen.json");
// Stands in for cloudflared: records how it was started, then behaves like the chosen scenario.
const fake = join(dir, "fake-cloudflared.mjs");
writeFileSync(fake, `
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(out)}, JSON.stringify({ argv: process.argv.slice(2), token: process.env.TUNNEL_TOKEN ?? null, pid: process.pid }));
const mode = process.env.FAKE_MODE;
if (mode === "quick") setTimeout(() => console.error("2026-11-14 INF |  https://calm-river-demo.trycloudflare.com  |"), 50);
if (mode === "token" && process.env.TUNNEL_TOKEN) setTimeout(() => console.error("INF Registered tunnel connection connIndex=0"), 50);
if (mode === "fail") { console.error("ERR Invalid tunnel token"); process.exit(1); }
setInterval(() => {}, 1000);
`);

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (check: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); };
const seen = () => JSON.parse(readFileSync(out, "utf8")) as { argv: string[]; token: string | null; pid: number };
const withMode = (mode: string) => { process.env.FAKE_MODE = mode; return new Tunnel((args) => [process.execPath, [fake, ...args]]); };

let current: Tunnel | undefined;
afterEach(() => { current?.stop(); current = undefined; delete process.env.FAKE_MODE; });
// Windows keeps files locked for a moment; a leftover temp folder is harmless.
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

describe("Tunnel (cloudflared)", () => {
  it("quick mode: needs no account, finds the public address in the output", async () => {
    const t = current = withMode("quick");
    t.start({ mode: "quick", port: 8123 });
    expect(t.status.state).toBe("starting");
    await until(() => t.status.state === "running");
    expect(t.status).toEqual({ state: "running", url: "https://calm-river-demo.trycloudflare.com" });
    expect(seen().argv).toEqual(["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8123"]);
  });

  it("token mode: the token is in the environment, never on the command line", async () => {
    const t = current = withMode("token");
    t.start({ mode: "token", token: "eyJ-secret-token-value", publicUrl: "https://bookings.example.com", port: 8123 });
    await until(() => t.status.state === "running");
    expect(t.status).toEqual({ state: "running", url: "https://bookings.example.com" });
    const s = seen();
    expect(s.token).toBe("eyJ-secret-token-value");
    expect(s.argv.join(" ")).not.toContain("eyJ-secret-token-value");
    expect(s.argv).toEqual(["tunnel", "--no-autoupdate", "run"]);
  });

  it("reports a stopped or failing tunnel in plain words", async () => {
    const t = current = withMode("fail");
    t.start({ mode: "token", token: "bad", publicUrl: "https://x.example.com", port: 1 });
    await until(() => t.status.state === "failed");
    expect(t.status.state).toBe("failed");
    expect(t.status.message).toContain("Invalid tunnel token");
  });

  it("says so when cloudflared is not installed", async () => {
    const t = current = new Tunnel(() => ["definitely-not-a-real-binary-xyz", []]);
    t.start({ mode: "quick", port: 1 });
    await until(() => t.status.state === "failed");
    expect(t.status).toEqual({ state: "failed", message: "cloudflared is not installed on this computer" });
  });

  it("stop() ends the process; the same settings do not restart it, changed settings do", async () => {
    const t = current = withMode("quick");
    t.start({ mode: "quick", port: 8123 });
    await until(() => t.status.state === "running");
    const first = seen().pid;
    t.start({ mode: "quick", port: 8123 });
    await new Promise((r) => setTimeout(r, 150));
    expect(seen().pid).toBe(first);

    t.start({ mode: "quick", port: 8124 });
    await until(() => seen().pid !== first);
    expect(seen().pid).not.toBe(first);
    await until(() => !alive(first));
    expect(alive(first)).toBe(false);

    const second = seen().pid;
    t.stop();
    expect(t.status).toEqual({ state: "off" });
    await until(() => !alive(second));
    expect(alive(second)).toBe(false);
  });
});
