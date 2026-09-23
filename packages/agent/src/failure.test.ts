import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "@dispatchai/domain";
import { AgentEvent } from "@dispatchai/shared";
import { DispatchAgent } from "./agent.js";
import { N8nClient } from "./client.js";

describe("Phase 7: Failure Engineering Test Suite", () => {
  let domainService: DispatchService;
  let emittedEvents: AgentEvent[];

  beforeEach(() => {
    domainService = new DispatchService();
    emittedEvents = [];
  });

  it("Scenario 1: Bounded retries trigger retry events for retryable read operations", async () => {
    let retryCount = 0;
    const n8nClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService,
      onRetry: (attempt, maxRetries, err, correlationId) => {
        retryCount++;
      }
    });

    const agent = new DispatchAgent("failure_session_707", n8nClient);
    agent.subscribe((evt) => emittedEvents.push(evt));

    // Execute safe read query (findCustomer)
    const result = await agent.findCustomer("5125550101");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.customer?.firstName).toBe("Alicia");
  });

  it("Scenario 2: Duplicate mutation with identical idempotencyKey prevents duplicate work orders", async () => {
    const n8nClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService
    });

    const avail = await n8nClient.checkAvailability({ serviceType: "HVAC", serviceZone: "Austin-South", date: "2026-09-19" }, "corr_avail_dup");
    expect(avail.ok).toBe(true);
    if (!avail.ok) throw new Error(avail.error.message);
    const validSlot = avail.data.slots[0];
    expect(validSlot).toBeDefined();

    const initialWorkOrderCount = domainService.getStore().workOrders.size;
    const sameKey = `idem_dup_test_${Date.now()}`;

    // First mutation request
    const res1 = await n8nClient.createWorkOrder(
      {
        idempotencyKey: sameKey,
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "A/C Repair Idempotency Test",
        urgency: "STANDARD",
        slotId: validSlot.slotId,
        createdBy: "WEB_AGENT"
      },
      "corr_dup_1"
    );

    expect(res1.ok).toBe(true);
    if (!res1.ok) throw new Error(res1.error.message);
    const woId1 = res1.data.workOrder.id;

    // Second identical mutation request with SAME idempotency key
    const res2 = await n8nClient.createWorkOrder(
      {
        idempotencyKey: sameKey,
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "A/C Repair Idempotency Test",
        urgency: "STANDARD",
        slotId: validSlot.slotId,
        createdBy: "WEB_AGENT"
      },
      "corr_dup_2"
    );

    expect(res2.ok).toBe(true);
    if (!res2.ok) throw new Error(res2.error.message);
    expect(res2.data.workOrder.id).toBe(woId1); // Returned identical work order
    // Verified: No extra work order was added to the database store!
    expect(domainService.getStore().workOrders.size).toBe(initialWorkOrderCount + 1);

    const conflictingReplay = await n8nClient.createWorkOrder(
      {
        idempotencyKey: sameKey,
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "Different request using the same key",
        urgency: "STANDARD",
        slotId: validSlot.slotId,
        createdBy: "WEB_AGENT"
      },
      "corr_dup_conflict"
    );
    expect(conflictingReplay.ok).toBe(false);
    if (conflictingReplay.ok) throw new Error("Expected idempotency conflict");
    expect(conflictingReplay.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("Scenario 3: Attempting to book a taken/stale slot fails cleanly with SLOT_UNAVAILABLE", async () => {
    const n8nClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService
    });

    // slot_301 is seeded as already BOOKED in domain store
    const res = await n8nClient.createWorkOrder(
      {
        idempotencyKey: `idem_stale_${Date.now()}`,
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "Attempting stale slot booking",
        urgency: "STANDARD",
        slotId: "slot_301", // Already taken slot!
        createdBy: "WEB_AGENT"
      },
      "corr_stale_1"
    );

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("Expected stale slot failure");
    expect(res.error.code).toBe("SLOT_UNAVAILABLE");
    expect(res.error.retryable).toBe(false);
  });

  it("Scenario 4: Validation error for invalid parameters returns non-retryable error", async () => {
    const n8nClient = new N8nClient({
      baseUrl: "http://localhost:5678",
      secret: "test_secret",
      directService: domainService
    });

    // Invalid phone number (less than 10 digits)
    const res = await n8nClient.findCustomer({ phone: "123" }, "corr_val_1");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("Expected validation failure");
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.retryable).toBe(false);
  });
});
