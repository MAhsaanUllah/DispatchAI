import { describe, expect, it } from "vitest";
import { generateSeedData } from "./seed.js";
import { getBusinessConfig } from "./templates.js";
import { localDate } from "./schedule.js";

// The agent asks for slots on a business-local (America/Chicago) calendar day.
// The seed used to build its days on UTC days, so between 00:00 and 06:00 UTC the two
// disagreed and every availability query came back empty. These tests pin the seed to the
// same calendar the agent uses, for every hour of the day.
describe("seeded slots cover the business-local day the agent asks for", () => {
  const config = getBusinessConfig();
  const seededDates = () => new Set(generateSeedData(config).slots.map((slot) => slot.startAt.slice(0, 10)));

  it("offers slots on today's business-local date", () => {
    const today = localDate(new Date(), config.timeZone);
    expect(seededDates().has(today)).toBe(true);
  });

  it("offers slots on the next seven business-local days", () => {
    const dates = seededDates();
    const [y, m, d] = localDate(new Date(), config.timeZone).split("-").map(Number);
    for (let offset = 0; offset <= 7; offset++) {
      const day = new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
      expect(dates.has(day)).toBe(true);
    }
  });
});
