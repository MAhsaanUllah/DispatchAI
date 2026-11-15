import { describe, expect, it } from "vitest";
import { phoneOf } from "./InboxPage.js";

describe("Inbox call-back number", () => {
  it("finds the caller's number so staff can dial with one tap", () => {
    expect(phoneOf({ kind: "human", title: "Call back: +1 (512) 555-0101", detail: "The caller needs a person." })).toBe("+15125550101");
    expect(phoneOf({ kind: "emergency", title: "Possible emergency: 5125550101", detail: "" })).toBe("5125550101");
  });

  it("offers no dial link when there is no number, or for system errors", () => {
    expect(phoneOf({ kind: "human", title: "Call back: Unknown caller", detail: "Caller said: \"I want a person\"" })).toBeUndefined();
    expect(phoneOf({ kind: "tool_failure", title: "Booking system error for 5125550101", detail: "" })).toBeUndefined();
  });
});
