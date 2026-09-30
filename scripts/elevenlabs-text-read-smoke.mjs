// Read-only live ElevenLabs smoke: checks greeting and lookup/availability tools.
// It intentionally refuses mutation tools and does not create a work order.
import { randomUUID } from "node:crypto";
import { TextConversation } from "@elevenlabs/client";

const root = "https://dispatchai-agent.itsahsaanmughal.workers.dev";
const sessionId = `eleven_read_${randomUUID()}`;
const headers = { "Content-Type": "application/json", "x-dispatch-secret": process.env.N8N_WEBHOOK_SECRET, "x-session-id": sessionId };
if (!process.env.N8N_WEBHOOK_SECRET) throw new Error("N8N_WEBHOOK_SECRET is missing");
const signedResponse = await fetch(`${root}/api/voice/session`, { method: "POST", headers, body: JSON.stringify({ name: "Ahsaan", persona: "south_hvac" }) });
const signed = await signedResponse.json();
if (!signedResponse.ok || !signed.data?.signedUrl) throw new Error("Signed voice session failed");
const toolNames = [];
const messages = [];
const tool = (name) => async (parameters) => {
  toolNames.push(name);
  if (!["find_customer", "check_availability"].includes(name)) return JSON.stringify({ ok: false, error: "Read-only smoke test" });
  const response = await fetch(`${root}/api/voice/tools/${name}`, { method: "POST", headers, body: JSON.stringify({ persona: "south_hvac", parameters }) });
  return JSON.stringify(await response.json());
};
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
  onMessage: ({ role, message }) => messages.push({ role, message }),
  onError: (message) => messages.push({ role: "error", message: String(message) })
});
conversation.sendUserMessage("My AC stopped cooling last night. Please check available appointments for tomorrow.");
await new Promise((resolve) => setTimeout(resolve, 25000));
await conversation.endSession();
console.log(JSON.stringify({ conversationId: conversation.getId(), toolNames, messages: messages.slice(0, 8) }, null, 2));
