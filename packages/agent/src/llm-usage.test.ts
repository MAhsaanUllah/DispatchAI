import { afterEach, describe, expect, it, vi } from "vitest";
import { chat, setUsageSink } from "./llm.js";

const ask = [{ role: "system" as const, content: "Reply OK" }, { role: "user" as const, content: "ping" }];
afterEach(() => { vi.unstubAllGlobals(); setUsageSink(undefined); });

function reply(body: unknown) {
  vi.stubGlobal("fetch", async () => Response.json(body));
  const rows: unknown[] = [];
  setUsageSink((row) => rows.push(row));
  return rows;
}

describe("token usage per provider", () => {
  it("reads Anthropic's input_tokens and output_tokens", async () => {
    const rows = reply({ content: [{ type: "text", text: "OK" }], usage: { input_tokens: 12, output_tokens: 3 } });
    await chat({ provider: "anthropic", model: "claude-haiku-5-5", apiKey: "sk-ant-test-123456" }, ask);
    expect(rows).toEqual([{ provider: "anthropic", model: "claude-haiku-5-5", inputTokens: 12, outputTokens: 3, ok: true }]);
  });

  it("reads OpenAI-style prompt_tokens and completion_tokens", async () => {
    const rows = reply({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 20, completion_tokens: 5 } });
    await chat({ provider: "openai", model: "gpt-4o-mini", apiKey: "sk-test-123456" }, ask);
    expect(rows).toEqual([{ provider: "openai", model: "gpt-4o-mini", inputTokens: 20, outputTokens: 5, ok: true }]);
  });

  it("records null counts when the provider reports none", async () => {
    const rows = reply({ choices: [{ message: { content: "OK" } }] });
    await chat({ provider: "xai", model: "grok-3-mini", apiKey: "xai-test-123456" }, ask);
    expect(rows).toEqual([{ provider: "xai", model: "grok-3-mini", inputTokens: null, outputTokens: null, ok: true }]);
  });
});
