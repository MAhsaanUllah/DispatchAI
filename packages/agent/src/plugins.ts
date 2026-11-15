import { signEvent } from "@dispatchai/shared";
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
};

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
    limits: "One attempt per event for now; failed deliveries are not retried yet. On a home PC, n8n must run on the same machine or network.",
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
];

export const pluginById = (id: string) => plugins.find((plugin) => plugin.id === id);
