import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// By default the test starts its own server on a fresh temporary database. To test a running install
// (for example the Docker container), set E2E_URL and E2E_SETUP_TOKEN to a server that has no owner yet.
const port = 8793;
const external = process.env.E2E_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  // E2E_CHANNEL=chrome (or msedge) runs the installed browser instead of Playwright's own download.
  use: { baseURL: external ?? `http://127.0.0.1:${port}`, channel: process.env.E2E_CHANNEL },
  webServer: external ? undefined : {
    command: "node ./node_modules/vite-node/dist/cli.mjs packages/agent/src/bin/agent-server.ts",
    url: `http://127.0.0.1:${port}/health`,
    timeout: 60_000,
    env: {
      AGENT_PORT: String(port),
      HOST: "127.0.0.1",
      SETUP_TOKEN: "E2E-SETUP",
      DATABASE_URL: join(tmpdir(), `dispatchai-e2e-${Date.now()}.sqlite`),
      WEB_DIST: "packages/web/dist"
    }
  }
});
