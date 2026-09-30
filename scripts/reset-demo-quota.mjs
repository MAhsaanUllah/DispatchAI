// Reads or resets the demo call quota for one Google account.
// Usage: node scripts/reset-demo-quota.mjs <email>        reset to 2 fresh calls and clear any active-call lock
//        node scripts/reset-demo-quota.mjs <email> read   print the current quota without changing it
// The admin secret is ephemeral and is never printed or checked into Git.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const email = (process.argv[2] || "").trim().toLowerCase();
const readOnly = process.argv[3] === "read";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (process.argv[3] && !readOnly)) {
  console.error("Usage: node scripts/reset-demo-quota.mjs <email> [read]");
  process.exit(1);
}

const adminSecret = randomBytes(32).toString("hex");
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
await new Promise((done, fail) => {
  const child = spawn(process.execPath, [wrangler, "secret", "put", "DEMO_ADMIN_SECRET", "--name", "dispatchai-web"], { stdio: ["pipe", "ignore", "pipe"] });
  let error = "";
  child.stderr.on("data", (chunk) => { error += chunk.toString(); });
  child.on("error", fail);
  child.on("close", (code) => code === 0 ? done() : fail(new Error(`Could not set demo admin secret: ${error.slice(0, 300)}`)));
  child.stdin.end(adminSecret);
});

const origin = "https://dispatchai-web.itsahsaanmughal.workers.dev";
async function quota(body) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${origin}/api/admin/quota`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-admin-secret": adminSecret },
      body: JSON.stringify(body)
    });
    if (response.ok) return response.json();
    // A fresh admin secret needs a few seconds to propagate to the live version.
    if (response.status !== 401 || attempt >= 10) throw new Error(`Quota request failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

const before = await quota({ email });
console.log(`BEFORE callsUsed=${before.callsUsed} activeCallRemainingMs=${before.activeCallRemainingMs}`);
if (readOnly) process.exit(0);
const after = await quota({ email, callsUsed: 0, clearActive: true });
console.log(`AFTER callsUsed=${after.callsUsed} activeCallRemainingMs=${after.activeCallRemainingMs}`);
console.log("Quota reset: 2 fresh demo calls available.");
