import { describe, expect, it } from "vitest";
import { automatedCount, BOOKING_STEPS, FEATURES, GROUPS, phoneNote, recommendedFor, RUNS_ON } from "./features.js";

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

describe("every feature has a home on the Features page", () => {
  it("puts each feature in a group that exists, and gives every group at least one feature", () => {
    const titles = GROUPS.map((group) => group.title);
    for (const feature of FEATURES) expect(titles, feature.id).toContain(feature.group);
    for (const group of GROUPS) expect(FEATURES.some((feature) => feature.group === group.title), group.title).toBe(true);
  });

  it("has the public address feature, and the desktop copy no longer says it is not built", () => {
    expect(FEATURES.map((feature) => feature.id)).toContain("tunnel");
    expect(phoneNote("desktop")).toContain("Public address");
    expect(phoneNote("desktop")).not.toContain("not built");
    expect(RUNS_ON.find((option) => option.id === "desktop")!.points.join(" ")).not.toContain("not built");
  });
});
