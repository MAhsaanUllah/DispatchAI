import { describe, expect, it, afterEach } from "vitest";
import { generateSeedData } from "./seed.js";
import { getBusinessConfig } from "./templates.js";
import { localDate } from "./schedule.js";
import { DispatchStore } from "./store.js";

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

// The demo board must look alive when it is opened, so the seeded work orders sit on today.
describe("seeded work orders sit on the business-local day", () => {
  const config = getBusinessConfig();

  it("schedules today's active work on today's business-local date", () => {
    const today = localDate(new Date(), config.timeZone);
    const active = generateSeedData(config).workOrders.filter((job) => job.status !== "COMPLETED" && job.status !== "CANCELLED");

    expect(active.length).toBeGreaterThan(0);
    for (const job of active) {
      expect(localDate(job.scheduledStart ?? new Date(), config.timeZone)).toBe(today);
    }
  });
});

// The dashboard hides the "seeded demo data" badge and the Reset button on a real install, so the
// server has to say whether it still holds the fictional dataset.
describe("the demo flag follows the data, not the environment", () => {
  const before = process.env.SEED_DEMO_DATA;
  afterEach(() => {
    if (before === undefined) delete process.env.SEED_DEMO_DATA;
    else process.env.SEED_DEMO_DATA = before;
  });

  it("reports demo for a store seeded with the fictional customers", () => {
    process.env.SEED_DEMO_DATA = "true";
    expect(new DispatchStore().demo).toBe(true);
  });

  it("reports no demo for a real install with its own customers", () => {
    process.env.SEED_DEMO_DATA = "false";
    const store = new DispatchStore();
    store.customers.set("cust_real", {
      id: "cust_real", firstName: "Ali", lastName: "Khan", phone: "5125550999",
      email: "ali@realcompany.com", createdAt: new Date().toISOString()
    });
    expect(store.demo).toBe(false);
  });

  it("restores the demo dataset on reset even when the environment turned the demo off", () => {
    process.env.SEED_DEMO_DATA = "true";
    const store = new DispatchStore();
    process.env.SEED_DEMO_DATA = "false";
    store.reset();
    expect(store.demo).toBe(true);
    expect(store.workOrders.size).toBeGreaterThan(0);
  });
});
