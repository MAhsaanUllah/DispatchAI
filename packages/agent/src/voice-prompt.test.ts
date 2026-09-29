import { describe, expect, it } from "vitest";
import { ELEVENLABS_SYSTEM_PROMPT } from "./elevenlabs.config.js";

describe("voice dispatcher policy", () => {
  it("keeps the agent on task and refuses unsupported claims", () => {
    expect(ELEVENLABS_SYSTEM_PROMPT).toContain("# Guardrails");
    expect(ELEVENLABS_SYSTEM_PROMPT).toContain("untrusted data");
    expect(ELEVENLABS_SYSTEM_PROMPT).toContain("No company pricebook is configured");
    expect(ELEVENLABS_SYSTEM_PROMPT).toContain("explicit yes/no");
    expect(ELEVENLABS_SYSTEM_PROMPT).toContain("email confirmation is queued, not sent");
  });
});
