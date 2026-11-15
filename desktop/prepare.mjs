// Collects what the desktop app ships: the server as one file, the dashboard, and the Node runtime it runs on.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(import.meta.dirname, "build");
const run = (file, args, cwd = root) => execFileSync(file, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

run("npm", ["run", "build", "--workspace=@dispatchai/web"]);
if (!existsSync(resolve(root, "packages/web/dist/index.html"))) throw new Error("web build produced no dist/index.html");
cpSync(resolve(root, "packages/web/dist"), resolve(out, "web"), { recursive: true });

run("npx", ["rolldown", "packages/agent/src/bin/agent-server.ts", "--dir", "desktop/build", "--format", "esm", "--platform", "node", "--no-code-splitting"]);
// node:sqlite needs Node 24+, so ship the Node that built this.
copyFileSync(process.execPath, resolve(out, "node.exe"));
console.log("desktop/build ready");
