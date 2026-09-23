import { describe, it, expect } from "vitest";
import {
  FindCustomerInputSchema,
  CheckAvailabilityInputSchema,
  CreateWorkOrderInputSchema,
  RescheduleWorkOrderInputSchema,
  CancelWorkOrderInputSchema,
  toolSuccess,
  toolFailure
} from "./contracts.js";

describe("Tool Contracts & Response Envelopes", () => {
  it("creates valid success and failure response envelopes", () => {
    const success = toolSuccess({ test: 123 }, "corr-001");
    expect(success).toEqual({
      ok: true,
      data: { test: 123 },
      correlationId: "corr-001"
    });

    const failure = toolFailure("SLOT_TAKEN", "Slot already booked", false, "corr-002");
    expect(failure).toEqual({
      ok: false,
      error: {
        code: "SLOT_TAKEN",
        message: "Slot already booked",
        retryable: false
      },
      correlationId: "corr-002"
    });
  });

  describe("Schema Validation Boundaries", () => {
    it("validates FindCustomer input", () => {
      const valid = FindCustomerInputSchema.safeParse({ phone: "5125550101" });
      expect(valid.success).toBe(true);

      const invalid = FindCustomerInputSchema.safeParse({ phone: "123" });
      expect(invalid.success).toBe(false);
    });

    it("validates CheckAvailability input", () => {
      const valid = CheckAvailabilityInputSchema.safeParse({
        serviceType: "HVAC",
        serviceZone: "Austin-South",
        date: "2026-09-18"
      });
      expect(valid.success).toBe(true);

      const invalidService = CheckAvailabilityInputSchema.safeParse({
        serviceType: "ELECTRICAL", // Not supported
        serviceZone: "Austin-South",
        date: "2026-09-18"
      });
      expect(invalidService.success).toBe(false);

      const invalidDate = CheckAvailabilityInputSchema.safeParse({
        serviceType: "HVAC",
        serviceZone: "Austin-South",
        date: "today" // Not YYYY-MM-DD
      });
      expect(invalidDate.success).toBe(false);
    });

    it("validates CreateWorkOrder input with required idempotencyKey and slotId", () => {
      const valid = CreateWorkOrderInputSchema.safeParse({
        idempotencyKey: "idem-101",
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "AC fan stopped running",
        urgency: "HIGH",
        slotId: "slot_303",
        createdBy: "VOICE_AGENT"
      });
      expect(valid.success).toBe(true);

      const missingIdempotency = CreateWorkOrderInputSchema.safeParse({
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "AC fan stopped running",
        urgency: "HIGH",
        slotId: "slot_303",
        createdBy: "VOICE_AGENT"
      });
      expect(missingIdempotency.success).toBe(false);
    });

    it("validates RescheduleWorkOrder input", () => {
      const valid = RescheduleWorkOrderInputSchema.safeParse({
        idempotencyKey: "idem-resched-1",
        workOrderId: "wo_1001",
        newSlotId: "slot_305"
      });
      expect(valid.success).toBe(true);
    });

    it("validates CancelWorkOrder input", () => {
      const valid = CancelWorkOrderInputSchema.safeParse({
        idempotencyKey: "idem-cancel-1",
        workOrderId: "wo_1001",
        reason: "Customer solved the issue independently"
      });
      expect(valid.success).toBe(true);
    });
  });
});
