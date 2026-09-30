// Two-phase booking smoke on the live ElevenLabs agent (text mode).
// Forwards all six dispatcher tools to the deployed agent worker; the worker's
// confirmation gate stays enforced (first create returns CONFIRMATION_REQUIRED,
// second call with confirmed=true books). Prints tool calls and resulting work order.
import { randomUUID } from "node:crypto";
import { TextConversation } from "@elevenlabs/client";

const root = "https://dispatchai-agent.itsahsaanmughal.workers.dev";
const sessionId = `eleven_book_${randomUUID()}`;
const headers = { "Content-Type": "application/json", "x-dispatch-secret": process.env.N8N_WEBHOOK_SECRET, "x-session-id": sessionId };
if (!process.env.N8N_WEBHOOK_SECRET) throw new Error("N8N_WEBHOOK_SECRET is missing");

const signedResponse = await fetch(`${root}/api/voice/session`, { method: "POST", headers, body: JSON.stringify({ name: "Ahsaan", persona: "south_hvac" }) });
const signed = await signedResponse.json();
if (!signedResponse.ok || !signed.data?.signedUrl) throw new Error(`Signed voice session failed: ${JSON.stringify(signed).slice(0, 200)}`);

const calls = [];
const messages = [];
const tool = (name) => async (parameters) => {
  const started = Date.now();
  const response = await fetch(`${root}/api/voice/tools/${name}`, { method: "POST", headers, body: JSON.stringify({ persona: "south_hvac", parameters }) });
  const body = await response.json();
  calls.push({ name, ms: Date.now() - started, raw: JSON.stringify(body) });
  return JSON.stringify(body);
};

const isBooked = (call) => {
  if (call.name !== "create_work_order") return false;
  try {
    const body = JSON.parse(call.raw);
    return body.envelope?.ok === true || body.ok === true;
  } catch { return false; }
};

let confirmReplies = 0;
let repliedToSlots = false;
const conversation = await TextConversation.startSession({
  signedUrl: signed.data.signedUrl,
  textOnly: true,
  dynamicVariables: {
    visitor_name: signed.data.name,
    demo_address: signed.data.address,
    demo_phone: signed.data.phone,
    demo_service_type: signed.data.serviceType,
    demo_zone: signed.data.zone,
    demo_today: signed.data.today,
    demo_tomorrow: signed.data.tomorrow
  },
  clientTools: Object.fromEntries(["find_customer", "check_availability", "get_work_order", "create_work_order", "reschedule_work_order", "cancel_work_order"].map((name) => [name, tool(name)])),
  onMessage: ({ role, message }) => {
    messages.push({ role, message });
    if (role !== "agent") return;
    const text = message.toLowerCase();
    if (confirmReplies >= 2) return;
    if (/confirm|say "yes"|say yes/.test(text)) {
      confirmReplies++;
      setTimeout(() => conversation.sendUserMessage("Yes, I confirm. Please book the first slot you listed, under Ahsaan."), 1500);
    } else if (!repliedToSlots && /works best|which (time|slot)|slots/.test(text)) {
      repliedToSlots = true;
      setTimeout(() => conversation.sendUserMessage("Please book the first slot you listed, under Ahsaan."), 1500);
    }
  },
  onError: (message) => messages.push({ role: "error", message: String(message) })
});

conversation.sendUserMessage("My AC stopped cooling last night. Please book the first available HVAC appointment tomorrow for Ahsaan.");

const deadline = Date.now() + 110000;
let endAt = 0;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (!endAt && calls.some(isBooked)) endAt = Date.now() + 8000;
  if (endAt && Date.now() >= endAt) break;
}
await conversation.endSession();

const jobsResponse = await fetch(`${root}/api/jobs`, { headers });
const jobsText = await jobsResponse.text();
console.log(JSON.stringify({
  conversationId: conversation.getId(),
  confirmReplies,
  calls: calls.map(({ name, ms, raw }) => ({ name, ms, raw: raw.slice(0, 300) })),
  messages: messages.slice(-8),
  jobsStatus: jobsResponse.status,
  jobs: jobsText.slice(0, 900)
}, null, 2));
