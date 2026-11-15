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

  it("stores where it runs and rejects anything else", async () => {
    expect((await call("/api/business")).body.data.config.runsOn).toBe("desktop");
    expect((await put({ runsOn: "mars" })).status).toBe(400);
    expect((await put({ runsOn: "cloud" })).status).toBe(200);
    expect((await call("/api/business")).body.data.config.runsOn).toBe("cloud");
  });

  it("switches to salon, renames it and replaces the demo data", async () => {
    const res = await put({ templateId: "salon", name: "Noor Salon", timeZone: "Asia/Karachi", serviceZones: ["Gulberg Branch"] });
    expect(res.status).toBe(200);
    const business = (await call("/api/business")).body.data;
    expect(business.configured).toBe(true);
    // Where it runs belongs to the install, not the template: a type switch keeps it.
    expect(business.config).toMatchObject({ templateId: "salon", name: "Noor Salon", timeZone: "Asia/Karachi", serviceZones: ["Gulberg Branch"], runsOn: "cloud" });
    expect((await call("/api/directory")).body.data.company.name).toBe("Noor Salon");
    expect((await call("/api/jobs")).body.data.jobs).toEqual([]);
  });

  it("locks the business type after the first real booking but still allows renaming", async () => {
    const chat = (message: string) => call("/api/chat", { method: "POST", body: JSON.stringify({ message }) });
    await chat("5555550901");
    await chat("Jordan Lee");
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

  it("a new service area reaches the staff already on the roster", async () => {
    const before = (await call("/api/directory")).body.data;
    expect(before.technicians.length).toBeGreaterThan(0);
    const zones = [...before.company.serviceZones, "Johar Town"];
    expect((await put({ serviceZones: zones })).status).toBe(200);
    const after = (await call("/api/directory")).body.data;
    expect(after.company.serviceZones).toContain("Johar Town");
    for (const tech of after.technicians) expect(tech.serviceZones).toContain("Johar Town");
  });
});

describe("staff hours and the greeting", () => {
  const putStaff = (staff: unknown) => call("/api/staff", { method: "PUT", body: JSON.stringify({ staff }) });
  it("saves a person's own hours, rejects bad ones, and keeps them when the areas change", async () => {
    const current = (await call("/api/directory")).body.data.technicians.map((t: { id: string; name: string; skills: string[] }) => ({ id: t.id, name: t.name, skills: t.skills }));
    const mornings = { sun: null, mon: { open: "09:00", close: "12:00" }, tue: null, wed: null, thu: null, fri: null, sat: null };
    expect((await putStaff([{ ...current[0], hours: mornings }, ...current.slice(1)])).status).toBe(200);
    expect((await call("/api/directory")).body.data.technicians[0].hours.mon).toEqual({ open: "09:00", close: "12:00" });
    expect((await putStaff([{ ...current[0], hours: { ...mornings, mon: { open: "12:00", close: "09:00" } } }])).status).toBe(400);
    expect((await put({ serviceZones: ["Another Area"] })).status).toBe(200);
    expect((await call("/api/directory")).body.data.technicians[0].hours.mon).toEqual({ open: "09:00", close: "12:00" });
  });

  it("saves the greeting the agent opens with, and falls back to the type's own when left empty", async () => {
    expect((await put({ greeting: "Salam! Noor Salon here. How can I help?" })).status).toBe(200);
    expect((await call("/api/business")).body.data.config.greeting).toBe("Salam! Noor Salon here. How can I help?");
    expect((await call("/api/directory")).body.data.company.greeting).toBe("Salam! Noor Salon here. How can I help?");
  });
});

describe("agent name and tone", () => {
  it("saves a name and tone, rejects an unknown tone, and the tone changes the handoff line", async () => {
    expect((await put({ agentName: "Aisha", tone: "brief" })).status).toBe(200);
    const config = (await call("/api/business")).body.data.config;
    expect(config).toMatchObject({ agentName: "Aisha", tone: "brief" });
    expect((await call("/api/directory")).body.data.company).toMatchObject({ agentName: "Aisha", tone: "brief" });
    expect((await put({ tone: "shouty" })).status).toBe(400);
    const reply = (await call("/api/chat", { method: "POST", body: JSON.stringify({ message: "I want to speak to a real person" }) })).body.reply as string;
    expect(reply).toBe("A team member will call you back. Anything to pass on?");
    expect((await put({ tone: "friendly" })).status).toBe(200);
  });
});
