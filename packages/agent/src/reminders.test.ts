import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bookingNotice, getBusinessConfig } from "@dispatchai/domain";
import type { WorkOrder } from "@dispatchai/shared";
import { dueReminders, reminderKey, ReminderLog } from "./reminders.js";
import { getOrCreateAgent, handleRequest, runReminders } from "./worker.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-reminders-"));
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows file lock */ } });

const wo = (id: string, scheduledStart: string, status: WorkOrder["status"] = "BOOKED") =>
  ({ id, scheduledStart, status } as WorkOrder);
const H = 3_600_000;

describe("which reminders are due", () => {
  it("sends inside the window, skips started, cancelled and already-sent appointments", () => {
    const now = Date.parse("2026-11-12T10:00:00Z");
    const list = [
      wo("wo_a", "2026-11-13T09:00:00Z"), // 23 h ahead: due
      wo("wo_b", "2026-11-13T11:00:00Z"), // 25 h ahead: not yet
      wo("wo_c", "2026-11-12T09:00:00Z"), // already started
      wo("wo_d", "2026-11-13T08:00:00Z", "CANCELLED"),
      wo("wo_e", "2026-11-12T20:00:00Z") // due, but sent before
    ];
    const sent = new Set([reminderKey(list[4])]);
    expect(dueReminders(list, 24, now, (k) => sent.has(k)).map((w) => w.id)).toEqual(["wo_a"]);
  });

  it("catches up after downtime: a reminder that fell due while off still goes, once", () => {
    const appointment = wo("wo_f", "2026-11-13T09:00:00Z");
    // Server was off when the reminder fell due (09:00 on the 12th); it starts again at 20:00.
    expect(dueReminders([appointment], 24, Date.parse("2026-11-12T20:00:00Z"), () => false)).toHaveLength(1);
  });

  it("is exact across the US spring-forward change (24 real hours, local time in the email)", () => {
    // 10:00 CDT on Sunday 8 March 2026 = 15:00 UTC; 24 h earlier is 15:00 UTC on the 7th (09:00 CST).
    const appointment = wo("wo_dst", "2026-03-08T15:00:00Z");
    expect(dueReminders([appointment], 24, Date.parse("2026-03-07T14:59:00Z"), () => false)).toHaveLength(0);
    expect(dueReminders([appointment], 24, Date.parse("2026-03-07T15:00:00Z"), () => false)).toHaveLength(1);
    const text = bookingNotice({ id: "wo_1026", serviceType: "HVAC", scheduledStart: appointment.scheduledStart }, "REMINDER", getBusinessConfig("field-service")).message;
    expect(text).toMatch(/Sunday, March 8.*10:00\sAM CDT/);
  });

  it("remembers sent reminders across a restart", () => {
    const path = join(dir, "log.sqlite");
    new ReminderLog(path).mark("wo_g@2026-11-13T09:00:00Z");
    expect(new ReminderLog(path).has("wo_g@2026-11-13T09:00:00Z")).toBe(true);
    expect(new ReminderLog(path).has("wo_g@2026-11-14T09:00:00Z")).toBe(false); // rescheduled: new reminder
  });
});

describe("reminders plugin", () => {
  const api = async (path: string, init: RequestInit = {}) => {
    const res = await handleRequest(new Request(`http://localhost${path}`, { headers: { "Content-Type": "application/json", "x-session-id": "rem" }, ...init }));
    return { status: res.status, body: (await res.json()) as any };
  };

  it("does nothing while off, then reminds each booked appointment once", async () => {
    const chat = (message: string) => api("/api/chat", { method: "POST", body: JSON.stringify({ message }) });
    await chat("5125550101");
    await chat("1402 South Congress Ave");
    await chat("My AC is blowing warm air, can you come tomorrow?");
    await chat(`Please book ${getOrCreateAgent("rem").getState().availableSlots[0].slotId}`);
    await chat("yes");
    const start = Date.parse(getOrCreateAgent("rem").getState().activeWorkOrder!.scheduledStart!);

    expect(await runReminders(start - 2 * H)).toBe(0); // plugin off
    expect((await api("/api/plugins/reminders", { method: "PUT", body: JSON.stringify({ enabled: true, values: { hoursBefore: "7" } }) })).status).toBe(400);
    expect((await api("/api/plugins/reminders", { method: "PUT", body: JSON.stringify({ enabled: true, values: { hoursBefore: "24" } }) })).status).toBe(200);
    expect(await runReminders(start - 30 * H)).toBe(0); // too early
    expect(await runReminders(start - 2 * H)).toBeGreaterThanOrEqual(1);
    expect(await runReminders(start - 1 * H)).toBe(0); // never twice
    const card = (await api("/api/plugins")).body.data.plugins.find((p: { id: string }) => p.id === "reminders");
    expect(card.preview[0].title).toMatch(/^Appointment reminder/);
  });
});
