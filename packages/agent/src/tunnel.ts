import { spawn, type ChildProcess } from "node:child_process";

export type TunnelStatus = { state: "off" | "starting" | "running" | "failed"; url?: string; message?: string };
export type TunnelOptions = { mode: "quick" | "token"; token?: string; publicUrl?: string; port: number };

const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
type Launch = (args: string[]) => [file: string, args: string[]];

// The helper program gets the normal system environment (PATH, proxies, ...) but none of this app's own secrets:
// MASTER_KEY, SETUP_TOKEN, API keys, the database path. Only the tunnel's own token is added back, in token mode.
const SECRET_NAME = /KEY|SECRET|TOKEN|PASSWORD|DATABASE/i;
export function childEnv(base: NodeJS.ProcessEnv, token?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(base)) if (!SECRET_NAME.test(name)) env[name] = value;
  if (token) env.TUNNEL_TOKEN = token;
  return env;
}

// Gives this server a public HTTPS address by running Cloudflare's `cloudflared`, for example so a phone line or an
// AI assistant can reach a desktop install. "quick" needs no account but the address changes on every start (good for
// trying things); "token" uses your own Cloudflare tunnel and a stable hostname.
export class Tunnel {
  status: TunnelStatus = { state: "off" };
  private child?: ChildProcess;
  private key = "";

  // CLOUDFLARED_PATH points at a bundled binary; otherwise `cloudflared` must be on the PATH.
  constructor(private launch: Launch = (args) => [process.env.CLOUDFLARED_PATH || "cloudflared", args]) {}

  // Starts, or restarts when the settings changed. The token goes in the environment, never on the command line.
  start(options: TunnelOptions): void {
    const key = JSON.stringify(options);
    if (this.child && this.key === key) return;
    this.stop();
    this.key = key;
    this.status = { state: "starting" };

    const args = options.mode === "quick"
      ? ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${options.port}`]
      : ["tunnel", "--no-autoupdate", "run"];
    const [file, fullArgs] = this.launch(args);
    const child = spawn(file, fullArgs, {
      env: childEnv(process.env, options.mode === "token" ? options.token : undefined),
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true
    });
    this.child = child;

    let last = "";
    const onData = (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        last = line.trim();
        if (this.child !== child) return;
        if (options.mode === "quick") {
          const found = QUICK_URL.exec(line);
          if (found) this.status = { state: "running", url: found[0] };
        } else if (/registered tunnel connection/i.test(line)) {
          this.status = { state: "running", url: options.publicUrl };
        }
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (error) => {
      if (this.child !== child) return;
      this.child = undefined;
      this.status = { state: "failed", message: /ENOENT/.test(error.message) ? "cloudflared is not installed on this computer" : error.message };
    });
    child.on("exit", (code) => {
      if (this.child !== child) return;
      this.child = undefined;
      this.status = { state: "failed", message: `cloudflared stopped (exit ${code}). Last line: ${last.slice(0, 160)}` };
    });
  }

  stop(): void {
    const child = this.child;
    this.child = undefined;
    this.key = "";
    this.status = { state: "off" };
    child?.kill();
  }
}

export const tunnel = new Tunnel();
process.on("exit", () => tunnel.stop());
