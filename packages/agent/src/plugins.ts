import { signEvent } from "@dispatchai/shared";
import { bookingNotice } from "@dispatchai/domain";
import type { PluginRecord } from "./plugin-store.js";

export type PluginField = { key: string; label: string; secret: boolean; placeholder?: string; help?: string };
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
    name: "n8n automations",
    category: "Automation",
    description: "Sends a signed event to your n8n workflow when a booking is created, rescheduled or cancelled. IDs only, no names or addresses.",
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
  }
];

export const pluginById = (id: string) => plugins.find((plugin) => plugin.id === id);
