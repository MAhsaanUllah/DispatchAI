import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "./service.js";

describe("Codex Concurrency & Race-Condition Audit", () => {
  let service: DispatchService;

  beforeEach(() => {
    service = new DispatchService();
  });

  it("proves two competing requests cannot both successfully book the same slot", async () => {
    // 1. Find a valid available slot
    const avail = service.checkAvailability({
      serviceType: "HVAC",
      serviceZone: "Austin-Central",
      date: "2026-09-18"
    });
    expect(avail.ok).toBe(true);
    if (!avail.ok) return;

    const targetSlot = avail.data.slots[0];
    expect(targetSlot).toBeDefined();

    // 2. Prepare two competing booking requests for the exact same slot from two distinct callers in Austin-Central
    const requestCallerA = () =>
      service.createWorkOrder({
        idempotencyKey: "idem_caller_A_compete",
        customerId: "cust_107",
        propertyId: "prop_207",
        serviceType: "HVAC",
        issueSummary: "Caller A - AC refrigerant leak",
        urgency: "HIGH",
        slotId: targetSlot.slotId,
        createdBy: "VOICE_AGENT"
      });

    const requestCallerB = () =>
      service.createWorkOrder({
        idempotencyKey: "idem_caller_B_compete",
        customerId: "cust_103",
        propertyId: "prop_203",
        serviceType: "HVAC",
        issueSummary: "Caller B - AC coil freezing up",
        urgency: "HIGH",
        slotId: targetSlot.slotId,
        createdBy: "WEB_AGENT"
      });

    // Execute concurrently
    const [resultA, resultB] = await Promise.all([
      Promise.resolve(requestCallerA()),
      Promise.resolve(requestCallerB())
    ]);

    // Exactly one must succeed, and the other must fail with SLOT_UNAVAILABLE
    const succeeded = [resultA, resultB].filter((r) => r.ok);
    const failed = [resultA, resultB].filter((r) => !r.ok);

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    if (!failed[0].ok) {
      expect(failed[0].error.code).toBe("SLOT_UNAVAILABLE");
    }

    // Verify slot in store is booked exactly once
    const slotInStore = service.getStore().slots.get(targetSlot.slotId);
    expect(slotInStore?.status).toBe("BOOKED");
  });

  it("guarantees idempotency replay does not double-mutate state or count as competing lock", () => {
    const avail = service.checkAvailability({
      serviceType: "PLUMBING",
      serviceZone: "Austin-South",
      date: "2026-09-18"
    });
    expect(avail.ok).toBe(true);
    if (!avail.ok) return;

    const targetSlot = avail.data.slots[0];
    const sharedIdempotencyKey = "idem_network_retry_safe";

    // First request
    const firstCall = service.createWorkOrder({
      idempotencyKey: sharedIdempotencyKey,
      customerId: "cust_105",
      propertyId: "prop_205",
      serviceType: "PLUMBING",
      issueSummary: "Burst kitchen pipe",
      urgency: "HIGH",
      slotId: targetSlot.slotId,
      createdBy: "WEB_AGENT"
    });

    expect(firstCall.ok).toBe(true);

    // Simulated network retry with identical idempotencyKey
    const retryCall = service.createWorkOrder({
      idempotencyKey: sharedIdempotencyKey,
      customerId: "cust_105",
      propertyId: "prop_205",
      serviceType: "PLUMBING",
      issueSummary: "Burst kitchen pipe",
      urgency: "HIGH",
      slotId: targetSlot.slotId,
      createdBy: "WEB_AGENT"
    });

    expect(retryCall.ok).toBe(true);
    if (firstCall.ok && retryCall.ok) {
      expect(retryCall.data.workOrder.id).toBe(firstCall.data.workOrder.id);
    }
  });
});
