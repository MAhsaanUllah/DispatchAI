import { afterEach, describe, expect, it } from "vitest";
import { BusinessConfigSchema } from "@dispatchai/shared";
import { businessTemplates, getBusinessConfig } from "./templates.js";
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
