import { signEvent } from "@dispatchai/shared";
import { bookingNotice } from "@dispatchai/domain";
import type { PluginRecord } from "./plugin-store.js";
import { chat, LlmError, usage, type LlmConfig } from "./llm.js";

export type PluginField = { key: string; label: string; secret: boolean; placeholder?: string; help?: string; options?: { value: string; label: string }[] };
export type TestResult = { ok: boolean; message: string };

// Built-in plugins only (no uploaded code). Each one: fields the owner fills in, a real test, and plain-language limits.
export type Plugin = {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: PluginField[];
  limits: string;
  validate: (values: Record<string, string>) => string | null;
  test: (record: PluginRecord) => Promise<TestResult>;
  // Optional sample output shown on the card (e.g. email texts).
  preview?: () => { title: string; text: string }[];
  // Optional live status line for the card (e.g. today's AI usage).
  status?: () => { text: string; warning: boolean } | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const RESEND_URL = "https://api.resend.com/emails";

const isHttpUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export const plugins: Plugin[] = [
  {
    id: "n8n",
    name: "Custom workflow (n8n)",
    category: "Custom workflow",
    description: "Paste your n8n webhook link and DispatchAI sends a signed event when a booking is created, rescheduled or cancelled (IDs only, no names or addresses). Host n8n on your cloud server or use n8n Cloud.",
    fields: [
      { key: "url", label: "Webhook URL", secret: false, placeholder: "http://n8n:5678/webhook/dispatchai-events", help: "Import n8n/workflows/dispatchai-events-starter.json in n8n and copy its webhook URL." },
      { key: "secret", label: "Signing secret", secret: true, help: "Any long random text. Set the same value as DISPATCHAI_EVENTS_SECRET in n8n." }
    ],
    limits: "Failed events are retried 5 times over about 8 minutes, then shown as Failed with a Retry button. On a home PC, n8n must run on the same machine or network.",
    validate: (values) => !isHttpUrl(values.url ?? "") ? "Webhook URL must start with http:// or https://"
      : (values.secret ?? "").length < 16 ? "Signing secret must be at least 16 characters" : null,
    test: async ({ config, secrets }) => {
      const body = JSON.stringify({ eventId: `evt_test_${crypto.randomUUID()}`, type: "test.ping", occurredAt: new Date().toISOString(), data: {} });
      const timestamp = String(Math.floor(Date.now() / 1000));
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-dispatchai-event": "test.ping", "x-dispatchai-timestamp": timestamp, "x-dispatchai-signature": await signEvent(body, timestamp, secrets.secret ?? "") },
          body,
          signal: AbortSignal.timeout(5000)
        });
        if (response.ok) return { ok: true, message: `n8n answered ${response.status}. Events will be delivered.` };
        return { ok: false, message: response.status === 401 ? "n8n rejected the signature. Check that both secrets match." : `n8n answered ${response.status}. Check the workflow is active.` };
      } catch {
        return { ok: false, message: "Could not reach the webhook URL. Is n8n running and the URL correct?" };
      }
    }
  }
  ,
  {
    id: "email",
    name: "Email (Resend)",
    category: "Messages",
    description: "Emails customers when a booking is confirmed, moved or cancelled. Uses your Resend account.",
    fields: [
      { key: "apiKey", label: "Resend API key", secret: true, placeholder: "re_...", help: "Create one at resend.com → API Keys (sending access is enough)." },
      { key: "from", label: "From address", secret: false, placeholder: "Noor Salon <bookings@yourdomain.com>", help: "Must use a domain you verified in Resend (SPF and DKIM records)." },
      { key: "testTo", label: "Send test emails to", secret: false, placeholder: "you@yourdomain.com", help: "Test emails only ever go to this address." }
    ],
    limits: "Customers with no email address on file are skipped. Demo addresses (@example.com) are never emailed. Failed sends are marked FAILED, not retried yet.",
    validate: (values) => (values.apiKey ?? "").length < 10 ? "Enter your Resend API key"
      : !/@/.test(values.from ?? "") ? "From address needs an email, e.g. Shop <bookings@yourdomain.com>"
      : !EMAIL.test(values.testTo ?? "") ? "Enter the email address for test emails" : null,
    test: async ({ config, secrets }) => {
      try {
        const response = await fetch(RESEND_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${secrets.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: config.from, to: [config.testTo], subject: "DispatchAI test email", text: "Your Email plugin works. Booking emails will be sent from this address." }),
          signal: AbortSignal.timeout(8000)
        });
        if (response.ok) return { ok: true, message: `Test email sent to ${config.testTo}. Check the inbox (and spam).` };
        const reason = ((await response.json().catch(() => ({}))) as { message?: string }).message ?? "";
        if (response.status === 401 || response.status === 403 && /api key/i.test(reason)) return { ok: false, message: "Resend rejected the API key." };
        return { ok: false, message: `Resend refused the email (${response.status})${reason ? `: ${reason.slice(0, 160)}` : ""}. A common cause is an unverified sender domain.` };
      } catch {
        return { ok: false, message: "Could not reach Resend. Check the internet connection." };
      }
    },
    preview: () => {
      const sample = { id: "wo_1001", serviceType: "", scheduledStart: new Date(Date.now() + 86_400_000).toISOString() };
      return (["BOOKED", "RESCHEDULED", "CANCELLED"] as const).map((event) => {
        const notice = bookingNotice(sample, event);
        return { title: notice.subject, text: notice.message };
      });
    }
  },
  {
    id: "ai",
    name: "AI brain",
    category: "AI",
    description: "Helps the agent understand callers who phrase things in their own words. The booking rules and the yes-confirmation stay in code; the AI only reads what the caller wants.",
    fields: [
      { key: "provider", label: "Provider", secret: false, options: [
        { value: "workers-ai", label: "Cloudflare Workers AI (free daily allowance)" },
        { value: "groq", label: "Groq (your key)" },
        { value: "gemini", label: "Google Gemini (your key)" },
        { value: "openai", label: "OpenAI (your key)" },
        { value: "anthropic", label: "Anthropic Claude (your key)" },
        { value: "xai", label: "xAI Grok (your key)" },
        { value: "ollama", label: "Ollama on this computer (no key)" }
      ] },
      { key: "model", label: "Model", secret: false, placeholder: "@cf/meta/llama-3.1-8b-instruct", help: "Workers AI: @cf/meta/llama-3.1-8b-instruct · Groq: llama-3.1-8b-instant · Gemini: gemini-2.0-flash · OpenAI: gpt-4o-mini · Anthropic: claude-haiku-5-5 · xAI: grok-3-mini · Ollama: llama3.1. Check your provider's docs for current model names." },
      { key: "accountId", label: "Cloudflare account ID", secret: false, help: "Workers AI only. Cloudflare dashboard → Workers AI → Use REST API." },
      { key: "apiKey", label: "API key / token", secret: true, help: "Not needed for Ollama." },
      { key: "baseUrl", label: "Ollama URL", secret: false, placeholder: "http://localhost:11434", help: "Ollama only." },
      { key: "priceIn", label: "Your price per million input tokens (USD)", secret: false, placeholder: "0.15", help: "Optional. From your provider's pricing page, only used to estimate the cost on the Features page. Leave both prices empty for a free tier or Ollama." },
      { key: "priceOut", label: "Your price per million output tokens (USD)", secret: false, placeholder: "0.60" }
    ],
    limits: "If the AI is down, slow or its free allowance is used up, the built-in rules keep answering (they understand simpler sentences). Check your provider's pricing page for current free limits.",
    validate: (values) => {
      const provider = values.provider;
      if (!["workers-ai", "groq", "gemini", "openai", "anthropic", "xai", "ollama"].includes(provider ?? "")) return "Choose a provider";
      if (!(values.model ?? "").trim()) return "Enter a model name";
      if (provider === "workers-ai" && !/^[0-9a-f]{32}$/i.test(values.accountId ?? "")) return "Enter your 32-character Cloudflare account ID";
      if (provider !== "ollama" && (values.apiKey ?? "").length < 10) return "Enter the API key";
      if (provider === "ollama" && values.baseUrl && !isHttpUrl(values.baseUrl)) return "Ollama URL must start with http:// or https://";
      const prices = [values.priceIn, values.priceOut].map((value) => (value ?? "").trim());
      if (prices.some((value) => value && !(Number(value) >= 0))) return "Prices must be numbers such as 0.15";
      if (prices.some(Boolean) && !prices.every(Boolean)) return "Enter both prices, or leave both empty";
      return null;
    },
    test: async ({ config, secrets }) => {
      try {
        const answer = await chat(llmConfig(config, secrets), [{ role: "system", content: "Reply with the single word OK." }, { role: "user", content: "ping" }]);
        return { ok: true, message: `The AI answered (“${answer.trim().slice(0, 40)}”). It will help with unclear messages.` };
      } catch (error) {
        const status = error instanceof LlmError ? error.status : 0;
        return {
          ok: false,
          message: status === 401 || status === 403 ? "The provider rejected the key or account ID."
            : status === 429 ? "The free allowance for today is used up. The built-in rules answer until it resets."
            : status === 404 ? "Model not found. Check the model name."
            : status === 0 ? "Could not reach the provider. For Ollama, check it is running." : `The provider answered with an error (${status}).`
        };
      }
    },
    status: () => usage.day === new Date().toISOString().slice(0, 10)
      ? { text: `Today: ${usage.calls} AI calls, ${usage.failures} failed${usage.quotaHit ? " · free allowance used up, using built-in rules" : ""}.`, warning: usage.quotaHit }
      : null
  }
];

plugins.push({
  id: "reminders",
  name: "Appointment reminders",
  category: "Messages",
  description: "Emails each customer a reminder before their appointment. Uses the Email plugin, so connect that first.",
  fields: [
    { key: "hoursBefore", label: "Send the reminder", secret: false, options: [
      { value: "2", label: "2 hours before" }, { value: "12", label: "12 hours before" },
      { value: "24", label: "24 hours before" }, { value: "48", label: "48 hours before" }
    ] }
  ],
  limits: "Email only for now (SMS comes later). One reminder per appointment time; a rescheduled booking gets a new one. Reminders that fell due while the server was off are sent once when it starts again, if the appointment is still ahead. Customers without an email address are skipped.",
  validate: (values) => ["2", "12", "24", "48"].includes(values.hoursBefore ?? "") ? null : "Choose when to send the reminder",
  test: async ({ config }) => ({ ok: true, message: `Reminders will go out ${config.hoursBefore} hours before each appointment through the Email plugin.` }),
  preview: () => {
    const notice = bookingNotice({ id: "wo_1001", serviceType: "", scheduledStart: new Date(Date.now() + 86_400_000).toISOString() }, "REMINDER");
    return [{ title: notice.subject, text: notice.message }];
  }
});

// Twilio phone line, kept out of the array literal above for readability.
plugins.push({
  id: "twilio",
  name: "Twilio phone line",
  category: "Phone",
  description: "Answers calls to your Twilio number with the same agent as the Test call. Callers who need a person are forwarded to staff while you are open, otherwise they get a call-back task in the Inbox.",
  fields: [
    { key: "accountSid", label: "Account SID", secret: false, placeholder: "AC…", help: "Twilio Console → Account info." },
    { key: "authToken", label: "Auth token", secret: true, help: "Used to check every call really comes from Twilio." },
    { key: "phoneNumber", label: "Your Twilio number", secret: false, placeholder: "+15551234567" },
    { key: "staffPhone", label: "Forward to staff (optional)", secret: false, placeholder: "+923001234567", help: "During opening hours, callers asking for a person are connected here." },
    { key: "publicUrl", label: "Public address of this dashboard", secret: false, placeholder: "https://bookings.yourdomain.com", help: "In Twilio, set the number's Voice webhook to <public address>/api/twilio/voice (HTTP POST)." }
  ],
  limits: "Twilio must reach this server over the internet: on a VPS use your HTTPS domain; on a home PC use a tunnel, and calls fail while the PC is off. Twilio charges per minute on your own account.",
  validate: (values) => !/^AC[0-9a-f]{32}$/i.test(values.accountSid ?? "") ? "Account SID starts with AC and has 34 characters"
    : (values.authToken ?? "").length < 32 ? "Enter the 32-character auth token"
    : !/^\+\d{8,15}$/.test(values.phoneNumber ?? "") ? "Twilio number must look like +15551234567"
    : values.staffPhone && !/^\+\d{8,15}$/.test(values.staffPhone) ? "Staff phone must look like +923001234567"
    : !/^https:\/\//.test(values.publicUrl ?? "") ? "Public address must start with https:// (Twilio cannot call localhost)" : null,
  test: async ({ config, secrets }) => {
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${secrets.authToken}`).toString("base64")}` },
        signal: AbortSignal.timeout(8000)
      });
      if (response.status === 401 || response.status === 404) return { ok: false, message: "Twilio rejected the Account SID or auth token." };
      if (!response.ok) return { ok: false, message: `Twilio answered ${response.status}.` };
      return { ok: true, message: `Twilio account OK. Now set the Voice webhook of ${config.phoneNumber} to ${config.publicUrl.replace(/\/$/, "")}/api/twilio/voice.` };
    } catch {
      return { ok: false, message: "Could not reach Twilio. Check the internet connection." };
    }
  }
});

export const llmConfig =(config: Record<string, string>, secrets: Record<string, string>): LlmConfig =>
  ({ provider: config.provider as LlmConfig["provider"], model: config.model, accountId: config.accountId, baseUrl: config.baseUrl, apiKey: secrets.apiKey });

export const pluginById = (id: string) => plugins.find((plugin) => plugin.id === id);
