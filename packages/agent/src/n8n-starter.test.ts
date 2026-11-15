import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const workflow = JSON.parse(read("n8n/workflows/dispatchai-events-starter.json"));
const node = (type: string) => workflow.nodes.find((n: any) => n.type === type);

// Found by running the starter in a real n8n 2.47: each of these made the documented
// URL or the signature check silently fail while the file still looked fine.
describe("n8n starter workflow", () => {
  it("has a fixed webhook id, otherwise n8n puts the workflow id in the URL and /webhook/dispatchai-events is a 404", () => {
    const webhook = node("n8n-nodes-base.webhook");
    expect(webhook.webhookId).toBe(webhook.parameters.path);
  });

  it("routes with a Switch whose parameters match its typeVersion (v1 rules format)", () => {
    const route = node("n8n-nodes-base.switch");
    expect(route.typeVersion).toBe(1);
    expect(route.parameters.rules.rules.map((r: any) => r.value2)).toEqual(["booking.created", "booking.rescheduled", "booking.cancelled", "invalid"]);
  });

  it("compose lets the Code node read the secret and use crypto", () => {
    const compose = read("docker-compose.yml");
    expect(compose).toMatch(/N8N_BLOCK_ENV_ACCESS_IN_NODE:\s*"false"/);
    expect(compose).toMatch(/NODE_FUNCTION_ALLOW_BUILTIN:\s*crypto/);
  });
});
