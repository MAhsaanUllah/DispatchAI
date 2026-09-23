import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.CLOUDFLARE_AGENT_ENDPOINT || "http://127.0.0.1:8788";
const sessionId = `smoke_${randomUUID()}`;
const headers = { "x-session-id": sessionId };

const health = await fetch(`${base}/health`).then((response) => response.json());
assert.equal(health.service, "DispatchAgent-Cloudflare-SDK");

const response = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ message: "My phone is 512-555-0101" })
});
assert.equal(response.status, 200);
const chat = await response.json();
assert.equal(chat.state.sessionId, sessionId);
assert.equal(chat.state.customer.firstName, "Alicia");

const state = await fetch(`${base}/api/state`, { headers }).then((result) => result.json());
assert.equal(state.customer.id, chat.state.customer.id);
assert.equal(state.history.length, chat.state.history.length);
console.log("Cloudflare Agent SDK -> n8n -> durable state: OK");
