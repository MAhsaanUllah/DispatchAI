import { describe, expect, it } from "vitest";
import { hoursText, type WeekHours } from "./hoursText.js";

const nine = { open: "09:00", close: "17:00" };
const week = (over: Partial<WeekHours>): WeekHours => ({ mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null, ...over });

describe("hoursText", () => {
  it("groups days in a row with the same hours", () => {
    expect(hoursText(week({ mon: nine, tue: nine, wed: nine, thu: nine, fri: nine }))).toBe("Mon to Fri 09:00 to 17:00");
  });

  it("keeps different hours and separate days apart, and skips closed days", () => {
    expect(hoursText(week({ mon: nine, tue: nine, thu: nine, sat: { open: "10:00", close: "14:00" } }))).toBe("Mon to Tue 09:00 to 17:00, Thu 09:00 to 17:00, Sat 10:00 to 14:00");
  });

  it("says so when every day is closed", () => {
    expect(hoursText(week({}))).toBe("Closed every day");
  });
});
