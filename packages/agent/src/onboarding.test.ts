import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getBusinessConfig, setBusinessConfig } from "@dispatchai/domain";
import { SettingsStore } from "./settings-store.js";
import { handleRequest } from "./worker.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-settings-"));
afterAll(() => {
  setBusinessConfig(undefined);
  // Windows keeps open SQLite files locked; a leftover temp folder is harmless.
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("SettingsStore", () => {
  it("keeps the saved business config and first-booking time across a restart", () => {
    const path = join(dir, "settings.sqlite");
    const first = new SettingsStore(path);
    first.saveConfig({ ...getBusinessConfig("salon"), name: "Noor Salon" });
    first.markFirstBooking("2026-11-10T10:00:00.000Z");
    first.markFirstBooking("2026-12-01T10:00:00.000Z");
    const restarted = new SettingsStore(path).load();
    expect(restarted.config?.name).toBe("Noor Salon");
    expect(restarted.firstBookingAt).toBe("2026-11-10T10:00:00.000Z");
  });
});

// No owner exists in this test process, so the API is open (see owner-setup.test.ts for the closed case).
const call = async (path: string, init: RequestInit = {}) => {
  const res = await handleRequest(new Request(`http://localhost${path}`, { headers: { "Content-Type": "application/json", "x-session-id": "onboard" }, ...init }));
  return { status: res.status, body: (await res.json()) as any };
};
const put = (body: unknown) => call("/api/business", { method: "PUT", body: JSON.stringify(body) });

describe("business onboarding API", () => {
  it("lists the four templates before setup", async () => {
    const { body } = await call("/api/business");
    expect(body.data.configured).toBe(false);
    expect(body.data.canSwitchTemplate).toBe(true);
    expect(body.data.templates.map((t: { templateId: string }) => t.templateId)).toEqual(["field-service", "salon", "auto-repair", "home-cleaning"]);
  });

  it("rejects a bad time zone and an empty location list", async () => {
    expect((await put({ templateId: "salon", timeZone: "Mars/Olympus" })).status).toBe(400);
    expect((await put({ templateId: "salon", serviceZones: [" "] })).status).toBe(400);
  });

  it("switches to salon, renames it and replaces the demo data", async () => {
    const res = await put({ templateId: "salon", name: "Noor Salon", timeZone: "Asia/Karachi", serviceZones: ["Gulberg Branch"] });
    expect(res.status).toBe(200);
    const business = (await call("/api/business")).body.data;
    expect(business.configured).toBe(true);
    expect(business.config).toMatchObject({ templateId: "salon", name: "Noor Salon", timeZone: "Asia/Karachi", serviceZones: ["Gulberg Branch"] });
    expect((await call("/api/directory")).body.data.company.name).toBe("Noor Salon");
    expect((await call("/api/jobs")).body.data.jobs).toEqual([]);
  });

  it("locks the business type after the first real booking but still allows renaming", async () => {
    const chat = (message: string) => call("/api/chat", { method: "POST", body: JSON.stringify({ message }) });
    await chat("5555550901");
    await chat("I need a haircut tomorrow");
    const slot = (await call("/api/state")).body.availableSlots[0].slotId;
    await chat(`Please book ${slot}`);
    expect((await chat("yes")).body.reply).toMatch(/confirmed/i);

    expect((await call("/api/business")).body.data.canSwitchTemplate).toBe(false);
    const switching = await put({ templateId: "field-service" });
    expect(switching.status).toBe(409);
    expect(switching.body.error.code).toBe("TEMPLATE_LOCKED");
    expect((await put({ name: "Noor Salon & Spa" })).status).toBe(200);
    expect((await call("/api/jobs")).body.data.jobs).toHaveLength(1);
  });

  const putStaff = (staff: unknown) => call("/api/staff", { method: "PUT", body: JSON.stringify({ staff }) });

  it("validates staff and will not remove someone with an upcoming booking", async () => {
    expect((await putStaff([{ name: "", skills: ["HAIRCUT"] }])).status).toBe(400);
    expect((await putStaff([{ name: "Sana", skills: ["PLUMBING"] }])).status).toBe(400);
    const removeAll = await putStaff([]);
    expect(removeAll.status).toBe(409);
    expect(removeAll.body.error.code).toBe("STAFF_HAS_BOOKINGS");
  });

  it("adds staff and services; the directory and new slots follow", async () => {
    const current = (await call("/api/directory")).body.data.technicians.map((t: { id: string; name: string; skills: string[] }) => ({ id: t.id, name: t.name, skills: t.skills }));
    expect((await put({ services: [{ name: "Haircut" }, { name: "Color" }, { name: "Bridal makeup" }] })).status).toBe(200);
    const res = await putStaff([...current, { name: "Hina", skills: ["BRIDAL_MAKEUP"] }]);
    expect(res.status).toBe(200);
    const directory = (await call("/api/directory")).body.data;
    expect(directory.services.map((s: { id: string }) => s.id)).toEqual(["HAIRCUT", "COLOR", "BRIDAL_MAKEUP"]);
    expect(directory.technicians.map((t: { name: string }) => t.name)).toContain("Hina");
  });
});
