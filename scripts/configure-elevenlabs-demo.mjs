// Run with `node --env-file=.env scripts/configure-elevenlabs-demo.mjs`.
// Updates only the existing agent's recruiter-demo greeting and prompt; no keys are printed.
const { ELEVENLABS_API_KEY: key, ELEVENLABS_AGENT_ID: id } = process.env;
if (!key || !id) throw new Error("ElevenLabs credentials are missing");
const endpoint = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(id)}`;
const headers = { "xi-api-key": key, "Content-Type": "application/json" };
const currentResponse = await fetch(endpoint, { headers });
if (!currentResponse.ok) throw new Error(`Could not read agent (${currentResponse.status})`);
const current = await currentResponse.json();
const agent = current.conversation_config?.agent;
if (!agent?.prompt?.prompt || !Array.isArray(agent.prompt.tools)) throw new Error("Unexpected agent configuration");
const marker = "# DispatchAI recruiter demo context";
const addition = `${marker}
The caller has already selected a synthetic service location and signed in. Greet {{visitor_name}}. The selected property is {{demo_address}} and its synthetic lookup phone is {{demo_phone}}. Service type is {{demo_service_type}} and zone is {{demo_zone}}. These are supplied as session context; use find_customer to verify the customer/property before relying on them. The caller should only describe their issue, choose a returned slot, and explicitly confirm. Never ask the caller to know a fake phone, street address, ZIP, customer ID, service zone, or technician name. Call check_availability using the selected service type/zone and a real Austin date. Only offer returned slots. First call create_work_order to prepare the selected slot; after the tool says CONFIRMATION_REQUIRED, ask for an explicit yes; only then call create_work_order again with confirmed=true. Never invent booking success. This is synthetic demo data; do not promise email delivery.`;
const identityNote = "# Recruiter identity guard\nThe live caller is {{visitor_name}}. The synthetic customer returned by find_customer is a separate fictional record used only for dispatch data. Never address the caller by the synthetic customer's first name; keep addressing {{visitor_name}}. Do not change synthetic customer contact details to the recruiter's Google identity.";
const promptWithDemo = agent.prompt.prompt.includes(marker) ? agent.prompt.prompt : `${agent.prompt.prompt}\n\n${addition}`;
const promptWithIdentity = promptWithDemo.includes("# Recruiter identity guard") ? promptWithDemo : `${promptWithDemo}\n\n${identityNote}`;
const dateNote = "# Austin demo date guard\nToday in Austin is {{demo_today}} and tomorrow is {{demo_tomorrow}}. Use these supplied dates for scheduling words such as today/tomorrow. Never infer the Austin date from your own clock or offer a slot for a different date than the one returned by check_availability.";
const prompt = promptWithIdentity.includes("# Austin demo date guard") ? promptWithIdentity : `${promptWithIdentity}\n\n${dateNote}`;
const firstMessage = "Hi {{visitor_name}}. For this demo I have the service location as {{demo_address}}. What can I help you with today?";
const { tools: _expandedTools, ...promptSettings } = agent.prompt;
const update = await fetch(endpoint, {
  method: "PATCH", headers,
  body: JSON.stringify({ conversation_config: { agent: { ...agent, first_message: firstMessage, prompt: { ...promptSettings, prompt } } }, version_description: "Personalize DispatchAI recruiter demo with synthetic service location" })
});
if (!update.ok) throw new Error(`Could not update agent (${update.status}): ${(await update.text()).slice(0, 300)}`);
const result = await update.json();
const tools = result.conversation_config?.agent?.prompt?.tools || [];
if (tools.filter((tool) => tool.type === "client").length !== 6 || result.conversation_config?.agent?.first_message !== firstMessage) throw new Error("Agent update did not preserve six client tools or greeting");
console.log("ElevenLabs demo greeting and six client tools verified");
