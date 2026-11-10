import { afterEach, describe, expect, it } from "vitest";
import { BusinessConfigSchema, type Technician } from "@dispatchai/shared";
import { generateScheduleSlots, localDate, zonedTimeToUtc } from "./schedule.js";
import { getBusinessConfig } from "./templates.js";
import { DispatchService } from "./service.js";

const staff: Technician[] = [
  { id: "tech_01", name: "Sana", skills: ["HAIRCUT"], serviceZones: ["Gulberg"], status: "ACTIVE" },
  { id: "tech_02", name: "Off", skills: ["HAIRCUT"], serviceZones: ["Gulberg"], status: "OFF_DUTY" }
];
const config = (overrides: object) => BusinessConfigSchema.parse({ ...getBusinessConfig("salon"), ...overrides });

describe("time zone conversion", () => {
  it("handles the US spring-forward and fall-back days", () => {
    // 2026-03-08: Chicago moves from CST (UTC-6) to CDT (UTC-5).
    expect(zonedTimeToUtc("2026-03-07", "09:00", "America/Chicago").toISOString()).toBe("2026-03-07T15:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-08", "09:00", "America/Chicago").toISOString()).toBe("2026-03-08T14:00:00.000Z");
    // 2026-11-01: back to CST.
    expect(zonedTimeToUtc("2026-10-31", "09:00", "America/Chicago").toISOString()).toBe("2026-10-31T14:00:00.000Z");
    expect(zonedTimeToUtc("2026-11-01", "09:00", "America/Chicago").toISOString()).toBe("2026-11-01T15:00:00.000Z");
  });

  it("uses the business day, not the UTC day", () => {
    // 19:30 in Chicago on 10 Nov is already 11 Nov in UTC.
    expect(localDate("2026-11-11T01:30:00Z", "America/Chicago")).toBe("2026-11-10");
    expect(zonedTimeToUtc("2026-11-10", "09:00", "Asia/Karachi").toISOString()).toBe("2026-11-10T04:00:00.000Z");
  });
});

describe("slots from opening hours", () => {
  it("creates slots only on open days, inside opening hours, for active staff", () => {
    const hours = { sun: null, mon: { open: "10:00", close: "13:00" }, tue: null, wed: null, thu: null, fri: null, sat: null };
    // Monday 9 Nov 2026, 08:00 in Karachi.
    const slots = generateScheduleSlots(config({ timeZone: "Asia/Karachi", hours, slotMinutes: 60 }), staff, new Date("2026-11-09T03:00:00Z"), 7);
    expect(slots.map((slot) => slot.startAt)).toEqual(["2026-11-09T05:00:00.000Z", "2026-11-09T06:00:00.000Z", "2026-11-09T07:00:00.000Z"]);
    expect(new Set(slots.map((slot) => slot.technicianId))).toEqual(new Set(["tech_01"]));
    expect(slots[0].id).toBe("slot_20261109_tech_01_1000");
  });

  it("rejects closing before opening", () => {
    const bad = BusinessConfigSchema.safeParse({ ...getBusinessConfig("salon"), hours: { ...getBusinessConfig("salon").hours, mon: { open: "17:00", close: "09:00" } } });
    expect(bad.success).toBe(false);
  });
});

describe("real business (no demo data)", () => {
  afterEach(() => {
    delete process.env.SEED_DEMO_DATA;
  });

  it("starts empty, gets slots once staff is added, and keeps booked staff", () => {
    process.env.SEED_DEMO_DATA = "false";
    const service = new DispatchService();
    const store = service.getStore();
    expect(store.slots.size).toBe(0);

    expect(store.setStaff([{ name: "Carlos", skills: ["HVAC"] }], ["Austin-South"])).toEqual([]);
    const tech = [...store.technicians.values()][0];
    expect(tech.id).toBe("tech_01");
    expect(store.slots.size).toBeGreaterThan(0);
    expect([...store.slots.values()].every((slot) => slot.technicianId === "tech_01")).toBe(true);

    // Book one future slot, then try to remove that staff member.
    const future = [...store.slots.values()].find((slot) => slot.startAt > new Date().toISOString())!;
    future.status = "BOOKED";
    expect(store.setStaff([], ["Austin-South"])).toEqual(["tech_01"]);
    expect(store.technicians.size).toBe(1);
  });
});
