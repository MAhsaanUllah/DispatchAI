// End-to-end smoke test against a running DispatchAI (Docker or local):
//   SETUP_TOKEN=... node scripts/docker-smoke.mjs [baseUrl]
// Checks health, the dashboard, first-run setup with the token, PIN login, and that protected APIs answer.
const base = (process.argv[2] ?? "http://localhost:8080").replace(/\/$/, "");
const token = process.env.SETUP_TOKEN;
const pin = "482915";
let cookie = "";

async function check(name, path, init = {}, expect = 200) {
  const res = await fetch(base + path, { ...init, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  if (res.status !== expect) throw new Error(`${name}: expected ${expect}, got ${res.status}`);
  console.log(`ok  ${name} (${res.status})`);
  return res;
}

try {
  await check("health", "/health");
  const page = await (await check("dashboard page", "/app")).text();
  if (!page.includes("<div id=\"root\">")) throw new Error("dashboard page: no app root");
  const status = await (await check("setup status", "/api/setup/status")).json();
  if (status.data.needsSetup) {
    if (!token) throw new Error("setup needed: run with SETUP_TOKEN set to the value in .env");
    await check("first-run setup", "/api/setup", { method: "POST", body: JSON.stringify({ code: token, name: "Smoke Test Owner", pin }) }, 201);
  }
  await check("protected API without login", "/api/jobs", {}, 401);
  await check("PIN login", "/api/auth/login", { method: "POST", body: JSON.stringify({ pin }) });
  await check("business settings", "/api/business");
  await check("plugins", "/api/plugins");
  console.log("smoke test passed");
} catch (error) {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
}
