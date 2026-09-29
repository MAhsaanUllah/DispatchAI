// Run with: node --env-file=.env scripts/sync-elevenlabs-prompt.mjs [--apply]
// This changes only the conversation prompt and greeting, preserving remote tools and voice settings.
import { readFile } from "node:fs/promises";

const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;
if (!key || !agentId || key.startsWith("your_") || agentId.startsWith("your_")) {
  throw new Error("Configured ElevenLabs API key and agent ID required");
}
const source = await readFile(new URL("../packages/agent/src/elevenlabs.config.ts", import.meta.url), "utf8");
const prompt = source.match(/export const ELEVENLABS_SYSTEM_PROMPT = `([\s\S]*?)`\.trim\(\);/)?.[1]?.trim();
if (!prompt) throw new Error("Local voice prompt not found");

const endpoint = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`;
const headers = { "xi-api-key": key, "Content-Type": "application/json" };
const currentResponse = await fetch(endpoint, { headers });
if (!currentResponse.ok) throw new Error(`ElevenLabs read failed (${currentResponse.status})`);
const current = await currentResponse.json();
const config = current.conversation_config;
if (!config?.agent?.prompt || typeof config.agent.prompt.prompt !== "string") {
  throw new Error("Remote agent uses an unsupported prompt layout; no changes made");
}
const changed = config.agent.prompt.prompt.trim() !== prompt;
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ agentConfigured: true, promptChanged: changed, remoteToolCount: config.agent.prompt.tools?.length ?? 0, applied: false }));
  process.exit(0);
}
if (!changed) {
  console.log(JSON.stringify({ agentConfigured: true, promptChanged: false, applied: false, reason: "already in sync" }));
  process.exit(0);
}
const updated = { ...config, agent: { ...config.agent, prompt: { ...config.agent.prompt, prompt } } };
const response = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify({ conversation_config: updated }) });
if (!response.ok) throw new Error(`ElevenLabs update failed (${response.status}); remote settings may be unchanged`);
const verifyResponse = await fetch(endpoint, { headers });
if (!verifyResponse.ok) throw new Error(`ElevenLabs verification failed (${verifyResponse.status})`);
const verified = await verifyResponse.json();
if (verified.conversation_config?.agent?.prompt?.prompt?.trim() !== prompt) throw new Error("Remote prompt did not match after update");
console.log(JSON.stringify({ agentConfigured: true, promptChanged: true, applied: true, verified: true, remoteToolCount: verified.conversation_config.agent.prompt.tools?.length ?? 0 }));
