import { describe, expect, it } from "vitest";
import { suggestGreeting, TONES } from "./persona.js";

describe("suggested greeting", () => {
  it("uses the business and the agent name in every tone", () => {
    for (const tone of TONES.map((t) => t.id)) {
      const text = suggestGreeting("Noor Salon", "Aisha", tone);
      expect(text).toContain("Noor Salon");
      expect(text).toContain("Aisha");
    }
  });

  it("still reads well without a name", () => {
    expect(suggestGreeting("Noor Salon", "", "friendly")).toBe("Hi, this is the Noor Salon booking assistant. Tell me which service you want and when, or give me your phone number.");
    expect(suggestGreeting("Noor Salon", "  ", "brief")).toBe("Noor Salon. What do you need, and when?");
  });

  it("gives every tone a sample line", () => {
    expect(TONES).toHaveLength(3);
    for (const tone of TONES) expect(tone.sample.length).toBeGreaterThan(10);
  });
});
