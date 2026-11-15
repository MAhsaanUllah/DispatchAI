import { afterEach, describe, expect, it, vi } from "vitest";
import { chat, setUsageSink, type LlmConfig } from "./llm.js";
import { fetchTwilioAccount } from "./twilio.js";
import { handleRequest } from "./worker.js";

const GROQ: LlmConfig = { provider: "groq", model: "llama-3.1-8b-instant", apiKey: "gsk_test_key_123456" };
afterEach(() => { vi.unstubAllGlobals(); setUsageSink(undefined); });

const answer = (body: unknown, status = 200) => vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));

describe("AI token counts", () => {
  it("reports the tokens the provider counted, and null when it did not say", async () => {
    const rows: unknown[] = [];
    setUsageSink((row) => rows.push(row));
    answer({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 120, completion_tokens: 8 } });
    await chat(GROQ, [{ role: "user", content: "ping" }]);
    answer({ result: { response: "OK" } }); // Workers AI shape without a usage block
    await chat({ provider: "workers-ai", model: "@cf/meta/llama-3.1-8b-instruct", accountId: "a".repeat(32), apiKey: "tok_123456789" }, [{ role: "user", content: "ping" }]);
    expect(rows).toEqual([
      { provider: "groq", model: "llama-3.1-8b-instant", inputTokens: 120, outputTokens: 8, ok: true },
      { provider: "workers-ai", model: "@cf/meta/llama-3.1-8b-instruct", inputTokens: null, outputTokens: null, ok: true }
    ]);
  });

  it("records a failed request too", async () => {
    const rows: { ok: boolean }[] = [];
    setUsageSink((row) => rows.push(row));
    answer({}, 429);
    await expect(chat(GROQ, [{ role: "user", content: "ping" }])).rejects.toBeTruthy();
    expect(rows).toEqual([expect.objectContaining({ ok: false, inputTokens: null })]);
  });
});

describe("Twilio account", () => {
  it("reads the balance and this month's calls and spend, with the owner's own credentials", async () => {
    const seen: { url: string; auth: string }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      seen.push({ url, auth: String((init?.headers as Record<string, string>).Authorization) });
      if (url.endsWith("/Balance.json")) return Response.json({ balance: "12.3400", currency: "USD" });
      if (url.includes("Category=calls")) return Response.json({ usage_records: [{ category: "calls", count: "42", usage: "61", usage_unit: "minutes" }] });
      return Response.json({ usage_records: [{ category: "totalprice", price: "1.2", price_unit: "usd" }] });
    }) as unknown as typeof fetch;
    const sid = `AC${"0".repeat(32)}`;
    const account = await fetchTwilioAccount(sid, "secret-token", fake);
    expect(account).toEqual({ balance: "12.3400", currency: "USD", month: { calls: 42, minutes: 61, spend: "1.2", unit: "USD" } });
    expect(seen).toHaveLength(3);
    expect(seen.every((call) => call.url.startsWith(`https://api.twilio.com/2010-04-01/Accounts/${sid}/`))).toBe(true);
    expect(seen[0].auth).toBe(`Basic ${Buffer.from(`${sid}:secret-token`).toString("base64")}`);
  });

  it("fails with the HTTP status when Twilio refuses", async () => {
    const refuse = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchTwilioAccount(`AC${"0".repeat(32)}`, "bad", refuse)).rejects.toThrow("401");
  });
});

describe("GET /api/usage", () => {
  it("says the AI brain and the phone line are off, and shows no dollars, until they are set up", async () => {
    const res = await handleRequest(new Request("http://localhost/api/usage", { headers: { "x-session-id": "usage" } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.ai).toMatchObject({ enabled: false, price: null, cost: null });
    expect(body.data.ai.today).toEqual({ requests: 0, failures: 0, inputTokens: 0, outputTokens: 0, unreported: 0 });
    expect(body.data.twilio).toMatchObject({ enabled: false, callsToday: 0 });
  });
});
