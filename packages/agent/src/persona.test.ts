import { describe, expect, it } from "vitest";
import type { WorkOrder } from "@dispatchai/shared";
import { confirmationLine, handoffLine, type Tone } from "./persona.js";

const order = { id: "wo_1007", technicianId: "tech_02", scheduledStart: "2026-11-16T10:00:00.000Z" } as WorkOrder;
const tones: Tone[] = ["friendly", "formal", "brief"];

describe("agent tone", () => {
  it("keeps the original wording for the friendly tone", () => {
    expect(confirmationLine("friendly", "BOOK", order, "N.")).toBe("I have confirmed your appointment! Work order #wo_1007 is booked with technician tech_02 for 2026-11-16T10:00:00.000Z. N.");
    expect(confirmationLine("friendly", "CANCEL", order, "N.")).toBe("I have confirmed the cancellation: Work order #wo_1007 has been cancelled. N.");
    expect(handoffLine("friendly")).toBe("I have asked a team member to call you back. Is there anything I can note for them?");
  });

  it("changes the wording but never drops the facts the caller needs", () => {
    for (const tone of tones) {
      expect(confirmationLine(tone, "BOOK", order, "N.")).toContain("wo_1007");
      expect(confirmationLine(tone, "BOOK", order, "N.")).toContain("2026-11-16T10:00:00.000Z");
      expect(confirmationLine(tone, "RESCHEDULE", order, "N.")).toContain("tech_02");
      expect(confirmationLine(tone, "CANCEL", order, "N.")).toContain("wo_1007");
      expect(handoffLine(tone)).toMatch(/call you back|contact you/);
    }
    expect(confirmationLine("formal", "BOOK", order, "N.")).not.toBe(confirmationLine("friendly", "BOOK", order, "N."));
    expect(confirmationLine("brief", "BOOK", order, "N.").length).toBeLessThan(confirmationLine("friendly", "BOOK", order, "N.").length);
  });
});

import { getBusinessConfig } from "@dispatchai/domain";
import { answerAbout } from "./persona.js";

describe("the agent knows its business", () => {
  const salon = { ...getBusinessConfig("salon"), agentName: "Aisha" };
  const plumber = getBusinessConfig("field-service");

  it("says who it is, and that it is an AI", () => {
    const reply = answerAbout("who are you?", salon)!;
    expect(reply).toContain("Aisha");
    expect(reply).toContain("Maple Street Salon");
    expect(reply).toContain("AI");
  });

  it("answers hours, areas and services from what was saved", () => {
    expect(answerAbout("what are your opening hours", salon)).toContain("Mon to Fri 09:00 to 17:00");
    expect(answerAbout("where can I find you", salon)).toBe("You can find us at Main Street Studio.");
    expect(answerAbout("do you come to my area", plumber)).toContain("Austin-Central");
    expect(answerAbout("what services do you offer", salon)).toContain("Haircut, Color");
  });

  it("stays quiet about anything else, so booking talk is never hijacked", () => {
    expect(answerAbout("my tap is leaking", plumber)).toBeNull();
    expect(answerAbout("yes please", salon)).toBeNull();
  });
});
