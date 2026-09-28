import { describe, it, expect } from "vitest";
import { getOrCreateAgent, handleRequest } from "./worker.js";

const SECRET = "dev_secret_dispatch_2026";

async function tool(sessionId: string, name: string, params: Record<string, unknown> = {}) {
  const res = await handleRequest(
    new Request(`http://localhost/api/voice/tools/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionId,
        "x-dispatch-secret": SECRET
      },
      body: JSON.stringify(params)
    })
  );
  return { status: res.status, body: (await res.json()) as any };
}

async function jobCount(): Promise<number> {
  const res = await handleRequest(
    new Request("http://localhost/api/jobs", { headers: { "x-session-id": "replay_test_observer" } })
  );
  const body = (await res.json()) as any;
  return body.data.jobs.length;
}

function createInvocations(sessionId: string): number {
  return getOrCreateAgent(sessionId)
    .getState()
    .events.filter((e) => e.type === "TOOL_CALL_STARTED" && e.toolName === "create_work_order").length;
}

async function identify(sessionId: string, phone: string) {
  const res = await tool(sessionId, "find_customer", { phone });
  expect(res.status).toBe(200);
  return res.body.result;
}

async function availableSlots(sessionId: string, serviceType: string, serviceZone: string, date: string) {
  const res = await tool(sessionId, "check_availability", { serviceType, serviceZone, date });
  expect(res.status).toBe(200);
  expect(res.body.result.slots.length).toBeGreaterThan(0);
  return res.body.result.slots as Array<{ slotId: string; technicianId: string; startAt: string }>;
}

describe("Duplicate voice booking replay hardening (real voice-tool HTTP path)", () => {
  it("A: exact immediate replay returns the original work order without a second mutation", async () => {
    const sid = "replay_test_a";
    await identify(sid, "5125550101");
    const slots = await availableSlots(sid, "HVAC", "Austin-South", "2026-09-19");
    const params = { slotId: slots[0].slotId, issueSummary: "AC not cooling - replay test A", urgency: "STANDARD" };

    const before = await jobCount();

    const proposed = await tool(sid, "create_work_order", params);
    expect(proposed.status).toBe(409);
    expect(proposed.body.envelope.error.code).toBe("CONFIRMATION_REQUIRED");

    const confirmed = await tool(sid, "create_work_order", { confirmed: true });
    expect(confirmed.status).toBe(200);
    const original = confirmed.body.result.workOrder;
    expect(original.status).toBe("BOOKED");
    expect(await jobCount()).toBe(before + 1);

    const replay = await tool(sid, "create_work_order", params);
    expect(replay.status).toBe(200);
    expect(replay.body.envelope.ok).toBe(true);
    expect(replay.body.result.workOrder.id).toBe(original.id);
    expect(replay.body.result.idempotentReplay).toBe(true);
    expect(getOrCreateAgent(sid).getState().pendingAction).toBeNull();
    expect(createInvocations(sid)).toBe(1);
    expect(await jobCount()).toBe(before + 1);
  });

  it("B: replay sent with confirmed=true also returns the original work order", async () => {
    const sid = "replay_test_b";
    await identify(sid, "5125550101");
    const slots = await availableSlots(sid, "HVAC", "Austin-South", "2026-09-19");
    const slotId = slots[0].slotId;

    const before = await jobCount();

    await tool(sid, "create_work_order", { slotId, issueSummary: "Furnace inspection - replay test B" });
    const confirmed = await tool(sid, "create_work_order", { confirmed: true });
    expect(confirmed.status).toBe(200);
    const original = confirmed.body.result.workOrder;

    const replay = await tool(sid, "create_work_order", { slotId, confirmed: true });
    expect(replay.status).toBe(200);
    expect(replay.body.result.workOrder.id).toBe(original.id);
    expect(replay.body.result.idempotentReplay).toBe(true);
    expect(createInvocations(sid)).toBe(1);
    expect(await jobCount()).toBe(before + 1);
  });

  it("C: a different slot is not a replay and opens its own confirmation cycle", async () => {
    const sid = "replay_test_c";
    await identify(sid, "5125550101");
    const slots = await availableSlots(sid, "HVAC", "Austin-South", "2026-09-19");

    const before = await jobCount();

    await tool(sid, "create_work_order", { slotId: slots[0].slotId, issueSummary: "First booking - replay test C" });
    const firstConfirm = await tool(sid, "create_work_order", { confirmed: true });
    expect(firstConfirm.status).toBe(200);
    const first = firstConfirm.body.result.workOrder;

    const second = await tool(sid, "create_work_order", {
      slotId: slots[1].slotId,
      issueSummary: "Second booking - replay test C"
    });
    expect(second.status).toBe(409);
    expect(second.body.envelope.error.code).toBe("CONFIRMATION_REQUIRED");
    expect(getOrCreateAgent(sid).getState().pendingAction?.type).toBe("CREATE_WORK_ORDER");

    const secondConfirm = await tool(sid, "create_work_order", { confirmed: true });
    expect(secondConfirm.status).toBe(200);
    const secondWo = secondConfirm.body.result.workOrder;
    expect(secondWo.id).not.toBe(first.id);
    expect(secondWo.status).toBe("BOOKED");
    expect(createInvocations(sid)).toBe(2);
    expect(await jobCount()).toBe(before + 2);
  });

  it("D: different customer/property/service is a normal new booking, not a replay", async () => {
    const sid = "replay_test_d";

    await identify(sid, "5125550106");
    const eastSlots = await availableSlots(sid, "PLUMBING", "Austin-East", "2026-09-19");
    await tool(sid, "create_work_order", { slotId: eastSlots[0].slotId, issueSummary: "Drain clog - replay test D" });
    const firstConfirm = await tool(sid, "create_work_order", { confirmed: true });
    expect(firstConfirm.status).toBe(200);
    const first = firstConfirm.body.result.workOrder;

    const before = await jobCount();

    await identify(sid, "5125550101");
    const southSlots = await availableSlots(sid, "HVAC", "Austin-South", "2026-09-19");
    const second = await tool(sid, "create_work_order", {
      slotId: southSlots[0].slotId,
      issueSummary: "Thermostat dead - replay test D"
    });
    expect(second.status).toBe(409);
    expect(second.body.envelope.error.code).toBe("CONFIRMATION_REQUIRED");

    const secondConfirm = await tool(sid, "create_work_order", { confirmed: true });
    expect(secondConfirm.status).toBe(200);
    const secondWo = secondConfirm.body.result.workOrder;
    expect(secondWo.id).not.toBe(first.id);
    expect(secondWo.customerId).toBe("cust_101");
    expect(createInvocations(sid)).toBe(2);
    expect(await jobCount()).toBe(before + 1);
  });

  it("E: an unrelated session is never served another session's booking", async () => {
    const before = await jobCount();

    await identify("replay_test_e1", "5125550101");
    const e1Slots = await availableSlots("replay_test_e1", "PLUMBING", "Austin-South", "2026-09-18");
    await tool("replay_test_e1", "create_work_order", { slotId: e1Slots[0].slotId, issueSummary: "Leak check - replay test E1" });
    const e1Confirm = await tool("replay_test_e1", "create_work_order", { confirmed: true });
    expect(e1Confirm.status).toBe(200);
    const e1Wo = e1Confirm.body.result.workOrder;

    await identify("replay_test_e2", "5125550101");
    const e2Slots = await availableSlots("replay_test_e2", "PLUMBING", "Austin-South", "2026-09-18");
    const e2Create = await tool("replay_test_e2", "create_work_order", {
      slotId: e2Slots[0].slotId,
      issueSummary: "Leak check - replay test E2"
    });
    expect(e2Create.status).toBe(409);
    expect(e2Create.body.envelope.error.code).toBe("CONFIRMATION_REQUIRED");

    const e2Confirm = await tool("replay_test_e2", "create_work_order", { confirmed: true });
    expect(e2Confirm.status).toBe(200);
    const e2Wo = e2Confirm.body.result.workOrder;
    expect(e2Wo.id).not.toBe(e1Wo.id);
    expect(createInvocations("replay_test_e1")).toBe(1);
    expect(createInvocations("replay_test_e2")).toBe(1);
    expect(await jobCount()).toBe(before + 2);
  });

  it("F: the confirmation gate for a brand-new booking is unchanged", async () => {
    const sid = "replay_test_f";
    await identify(sid, "5125550103");
    const slots = await availableSlots(sid, "HVAC", "Austin-Central", "2026-09-19");

    const before = await jobCount();

    const proposed = await tool(sid, "create_work_order", { slotId: slots[0].slotId, issueSummary: "No cooling - replay test F" });
    expect(proposed.status).toBe(409);
    expect(proposed.body.envelope.error.code).toBe("CONFIRMATION_REQUIRED");
    expect(getOrCreateAgent(sid).getState().pendingAction?.type).toBe("CREATE_WORK_ORDER");
    expect(createInvocations(sid)).toBe(0);
    expect(await jobCount()).toBe(before);

    const confirmed = await tool(sid, "create_work_order", { confirmed: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.result.workOrder.status).toBe("BOOKED");
    expect(createInvocations(sid)).toBe(1);
    expect(getOrCreateAgent(sid).getState().pendingAction).toBeNull();
    expect(await jobCount()).toBe(before + 1);
  });

  it("G: a genuine competing booking on a taken slot still fails with SLOT_UNAVAILABLE", async () => {
    const before = await jobCount();

    await identify("replay_test_g1", "5125550103");
    await identify("replay_test_g2", "5125550103");
    const g1Slots = await availableSlots("replay_test_g1", "PLUMBING", "Austin-Central", "2026-09-18");
    const g2Slots = await availableSlots("replay_test_g2", "PLUMBING", "Austin-Central", "2026-09-18");
    expect(g2Slots[0].slotId).toBe(g1Slots[0].slotId);

    await tool("replay_test_g1", "create_work_order", { slotId: g1Slots[0].slotId, issueSummary: "Water heater - replay test G1" });
    const g1Confirm = await tool("replay_test_g1", "create_work_order", { confirmed: true });
    expect(g1Confirm.status).toBe(200);

    const g2Create = await tool("replay_test_g2", "create_work_order", {
      slotId: g2Slots[0].slotId,
      issueSummary: "Water heater - replay test G2"
    });
    expect(g2Create.status).toBe(409);

    const g2Confirm = await tool("replay_test_g2", "create_work_order", { confirmed: true });
    expect(g2Confirm.status).toBe(400);
    expect(g2Confirm.body.envelope.error.code).toBe("SLOT_UNAVAILABLE");
    expect(await jobCount()).toBe(before + 1);
  });
});
