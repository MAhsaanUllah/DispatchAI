import { afterEach, describe, expect, it, vi } from "vitest";
import { DispatchStore } from "./store.js";
import { DispatchService } from "./service.js";
import { getDirectory } from "./directory.js";
import { deliverBookingEmails } from "./email.js";

const previousKey = process.env.RESEND_API_KEY;
const previousFrom = process.env.EMAIL_FROM;
afterEach(() => {
  if (previousKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previousKey;
  if (previousFrom === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = previousFrom;
  vi.restoreAllMocks();
});

describe("company directory and booking email", () => {
  it("lists the same seeded technicians and services used for scheduling", () => {
    const store = new DispatchStore();
    const directory = getDirectory(store);
    expect(directory.services.map((service) => service.id)).toEqual(["HVAC", "PLUMBING"]);
    expect(directory.technicians).toHaveLength(6);
    expect(directory.technicians.find((tech) => tech.id === "tech_06")?.status).toBe("OFF_DUTY");
    expect(directory.company.serviceZones).toContain("Austin-South");
  });

  it("queues an email preview after booking and never sends synthetic addresses", async () => {
    const store = new DispatchStore();
    const service = new DispatchService(store);
    const available = service.checkAvailability({ serviceType: "HVAC", serviceZone: "Austin-South", date: new Date().toISOString().slice(0, 10) });
    expect(available.ok).toBe(true);
    if (!available.ok) return;
    const booked = service.createWorkOrder({ idempotencyKey: "directory-email-test", customerId: "cust_101", propertyId: "prop_201", serviceType: "HVAC", issueSummary: "AC blowing warm air", urgency: "STANDARD", slotId: available.data.slots[0].slotId, createdBy: "VOICE_AGENT" });
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;
    const notice = store.notifications.find((item) => item.workOrderId === booked.data.workOrder.id && item.audience === "CUSTOMER");
    expect(notice).toMatchObject({ channel: "EMAIL", status: "PENDING_LOCAL", recipientAddress: "alicia.ramirez@example.com" });
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "Dispatch <bookings@dispatch.test>";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await deliverBookingEmails(store, booked.data.workOrder.id);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(notice?.status).toBe("PENDING_LOCAL");
  });
});
