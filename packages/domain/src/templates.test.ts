import { afterEach, describe, expect, it } from "vitest";
import { BusinessConfigSchema } from "@dispatchai/shared";
import { businessTemplates, detectService, getBusinessConfig } from "./templates.js";
import { DispatchService } from "./service.js";
import { getDirectory } from "./directory.js";
import { DispatchStore } from "./store.js";

describe("business templates", () => {
  afterEach(() => {
    delete process.env.BUSINESS_TEMPLATE;
  });

  it("ships the four v1 templates", () => {
    expect(businessTemplates.map((t) => t.templateId)).toEqual(["field-service", "salon", "auto-repair", "home-cleaning"]);
  });

  it("defaults to field service with the original demo values", () => {
    const config = getBusinessConfig();
    expect(config.name).toBe("Austin Metro Service Dispatch");
    expect(config.timeZone).toBe("America/Chicago");
    expect(config.services.map((s) => s.id)).toEqual(["HVAC", "PLUMBING"]);
  });

  it("selects a template from BUSINESS_TEMPLATE and the directory follows it", () => {
    process.env.BUSINESS_TEMPLATE = "salon";
    const directory = getDirectory(new DispatchStore());
    expect(directory.company.name).toBe("Maple Street Salon");
    expect(directory.services.map((s) => s.id)).toEqual(["HAIRCUT", "COLOR"]);
  });

  it("seeds salon staff and slots so a salon service can be booked", () => {
    process.env.BUSINESS_TEMPLATE = "salon";
    const service = new DispatchService();
    const avail = service.checkAvailability({ serviceType: "HAIRCUT", serviceZone: "Main Street Studio", date: "2026-09-18" });
    expect(avail.ok).toBe(true);
    if (!avail.ok) return;
    expect(avail.data.slots.length).toBeGreaterThan(0);
    const created = service.createWorkOrder({
      idempotencyKey: "idem_salon_1", customerId: "cust_901", propertyId: "prop_901", serviceType: "HAIRCUT",
      issueSummary: "Trim", urgency: "STANDARD", slotId: avail.data.slots[0].slotId, createdBy: "VOICE_AGENT"
    });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.data.workOrder.id).toBe("wo_1001");
  });

  it("rejects a service the active business does not offer", () => {
    const result = new DispatchService().checkAvailability({ serviceType: "ELECTRICAL", serviceZone: "Austin-South", date: "2026-09-18" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("detects the service from caller text, later service wins", () => {
    expect(detectService("my AC is leaking")).toBe("PLUMBING");
    expect(detectService("AC blowing warm air")).toBe("HVAC");
    expect(detectService("I need a haircut", getBusinessConfig("salon"))).toBe("HAIRCUT");
    expect(detectService("hello there")).toBeNull();
  });

  it("fails clearly on an unknown template", () => {
    expect(() => getBusinessConfig("dentist")).toThrow(/Unknown BUSINESS_TEMPLATE "dentist"/);
  });

  it("rejects an invalid config", () => {
    const bad = { ...getBusinessConfig(), timeZone: "Mars/Olympus", services: [] };
    const result = BusinessConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["timeZone", "services"]));
    }
  });
});
