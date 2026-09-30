// Creates a fresh email-bound owner link and one private reviewer link that
// admits up to N distinct Google accounts (argv[2], default 10, max 25).
// The admin secret is ephemeral and is never printed or checked into Git.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

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
async function invite(email, maxRedemptions) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${origin}/api/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-admin-secret": adminSecret },
      body: JSON.stringify(email ? { email, maxRedemptions } : { maxRedemptions })
    });
    if (response.ok) {
      const created = await response.json();
      if (created.maxRedemptions !== maxRedemptions) throw new Error("Reviewer cap not applied; deploy the web worker first");
      return created.url;
    }
    // A fresh admin secret needs a few seconds to propagate to the live version.
    if (response.status !== 401 || attempt >= 10) throw new Error(`Invite creation failed (${response.status})`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
const shareCount = Number.isInteger(+process.argv[2]) && +process.argv[2] > 0 ? Math.min(Math.floor(+process.argv[2]), 25) : 10;
console.log(`OWNER_TEST_URL=${await invite("itsahsaanmughal@gmail.com", 1)}`);
console.log(`SHARE_URL=${await invite("", shareCount)}`);
console.log(`SHARE_CAP=${shareCount} Google accounts, each capped at 2 demo calls`);
