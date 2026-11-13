import { describe, expect, it } from "vitest";
import { automatedCount, BOOKING_STEPS, FEATURES, recommendedFor } from "./features.js";

describe("booking steps and features", () => {
  it("counts four steps that always run and one more per feature switched on", () => {
    expect(BOOKING_STEPS).toHaveLength(9);
    expect(automatedCount([])).toBe(4);
    expect(automatedCount(["email", "reminders"])).toBe(6);
    expect(automatedCount(["twilio", "ai", "email", "reminders", "n8n"])).toBe(9);
  });

  it("only recommends features that exist, for every business type", () => {
    const ids = FEATURES.map((feature) => feature.id);
    for (const type of ["field-service", "salon", "auto-repair", "home-cleaning", "something-new"]) {
      for (const id of recommendedFor(type)) expect(ids).toContain(id);
    }
  });

  it("ties every optional booking step to a real feature", () => {
    const ids = FEATURES.map((feature) => feature.id);
    for (const step of BOOKING_STEPS) if (step.by) expect(ids).toContain(step.by);
  });
});
