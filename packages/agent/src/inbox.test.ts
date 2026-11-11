import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Inbox } from "./inbox.js";
import { Outbox } from "./outbox.js";
import { handleRequest } from "./worker.js";

const dir = mkdtempSync(join(tmpdir(), "dispatchai-inbox-"));
// Windows keeps open SQLite files locked; a leftover temp folder is harmless.
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

describe("Inbox store", () => {
  it("keeps one open task per kind and ref, survives restart, and records who closed it", () => {
    const path = join(dir, "inbox.sqlite");
    const first = new Inbox(path);
    expect(first.add("human", "s1", "Call back", "x")).toBeDefined();
    expect(first.add("human", "s1", "Call back", "again")).toBeUndefined();
    expect(first.add("emergency", "s1", "Gas", "y")).toBeDefined();

    const restarted = new Inbox(path);
    const [task] = restarted.list().filter((t) => t.kind === "human");
    expect(restarted.close(task.id, "Ayesha")).toBe(true);
    expect(restarted.close(task.id, "Ayesha")).toBe(false);
    expect(restarted.list().find((t) => t.id === task.id)).toMatchObject({ closedBy: "Ayesha" });
    expect(restarted.add("human", "s1", "Call back", "new call")).toBeDefined();
  });

  it("gets a task when an n8n event gives up", async () => {
    const inbox = new Inbox();
    const box = new Outbox(undefined, async () => undefined, (d) => inbox.add("delivery_failed", d.id, "n8n failed", d.lastError ?? ""));
    box.enqueue({ eventId: "evt_dead", type: "booking.created", data: { bookingId: "wo_1026" } }, 0);
    for (let i = 0, now = 0; i < 5; i++, now += 10 * 60_000) await box.drain(now);
    expect(inbox.list()).toEqual([expect.objectContaining({ kind: "delivery_failed", ref: "evt_dead" })]);
  });
});

describe("handoff from a conversation", () => {
  const call = async (path: string, session: string, init: RequestInit = {}) => {
    const res = await handleRequest(new Request(`http://localhost${path}`, { headers: { "Content-Type": "application/json", "x-session-id": session }, ...init }));
    return { status: res.status, body: (await res.json()) as any };
  };
  const chat = (session: string, message: string) => call("/api/chat", session, { method: "POST", body: JSON.stringify({ message }) });
  const tasks = async () => (await call("/api/inbox", "owner")).body.data.tasks as { id: string; kind: string; title: string; closedAt?: string; overdue: boolean }[];

  it("answers a danger report with safety advice and opens one emergency task", async () => {
    await chat("caller_gas", "5125550101");
    await chat("caller_gas", "1402 South Congress Ave");
    const reply = (await chat("caller_gas", "I think there is a gas leak in my kitchen")).body.reply;
    expect(reply).toMatch(/leave the area.*emergency number/i);
    await chat("caller_gas", "the gas leak smell is getting worse");
    const emergencies = (await tasks()).filter((t) => t.kind === "emergency");
    expect(emergencies).toHaveLength(1);
    expect(emergencies[0].title).toBe("Possible emergency: Alicia Ramirez (5125550101)");
    expect(emergencies[0].overdue).toBe(false);
  });

  it("creates a call-back task when the caller asks for a person", async () => {
    expect((await chat("caller_human", "Can I speak to a real person please")).body.reply).toMatch(/team member to call you back/);
    expect((await tasks()).some((t) => t.kind === "human" && t.title === "Call back: Unknown caller")).toBe(true);
  });

  it("does not treat a burst pipe as an emergency (it is a plumbing job)", async () => {
    const before = (await tasks()).length;
    await chat("caller_pipe", "5125550103");
    await chat("caller_pipe", "504 Colorado St");
    const reply = (await chat("caller_pipe", "I have a burst pipe and water is leaking, can you come tomorrow?")).body.reply;
    expect(reply).not.toMatch(/emergency number/);
    expect((await tasks()).length).toBe(before);
  });

  it("closes a task once", async () => {
    const [open] = (await tasks()).filter((t) => !t.closedAt);
    expect((await call(`/api/inbox/${open.id}/close`, "owner", { method: "POST" })).status).toBe(200);
    expect((await call(`/api/inbox/${open.id}/close`, "owner", { method: "POST" })).status).toBe(404);
  });
});
