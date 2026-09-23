import { describe, it, expect, beforeEach } from "vitest";
import { DispatchService } from "./service.js";

describe("DispatchService - Operational Tools & Business Logic", () => {
  let service: DispatchService;

  beforeEach(() => {
    service = new DispatchService();
  });

  describe("1. find_customer", () => {
    it("locates existing customer by exact phone number and returns properties", () => {
      const result = service.findCustomer({ phone: "5125550101" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.customer).not.toBeNull();
        expect(result.data.customer?.firstName).toBe("Alicia");
        expect(result.data.properties.length).toBeGreaterThanOrEqual(1);
        expect(result.data.properties[0].city).toBe("Austin");
      }
    });

    it("handles formatted phone numbers gracefully", () => {
      const result = service.findCustomer({ phone: "(512) 555-0101" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.customer?.id).toBe("cust_101");
      }
    });

    it("returns customer: null when phone number is not found", () => {
      const result = service.findCustomer({ phone: "5129999999" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.customer).toBeNull();
        expect(result.data.properties).toEqual([]);
      }
    });

    it("rejects invalid input schema", () => {
      const result = service.findCustomer({ phone: "12" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INPUT");
      }
    });
  });

  describe("2. check_availability", () => {
    it("offers slots tomorrow even after the fixed fixture dates have passed", () => {
      const tomorrow = new Date();
      tomorrow.setUTCHours(0, 0, 0, 0);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const date = tomorrow.toISOString().slice(0, 10);
      const result = service.checkAvailability({
        serviceType: "HVAC",
        serviceZone: "Austin-South",
        date
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.slots.length).toBeGreaterThan(0);
    });

    it("returns only available slots matching service type and zone", () => {
      const result = service.checkAvailability({
        serviceType: "HVAC",
        serviceZone: "Austin-South",
        date: "2026-09-18"
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.slots.length).toBeGreaterThan(0);
        for (const slot of result.data.slots) {
          expect(slot.startAt.startsWith("2026-09-18")).toBe(true);
          // Slot 301 is BOOKED and Slot 302 is RESERVED, so they must NOT appear
          expect(slot.slotId).not.toBe("slot_301");
          expect(slot.slotId).not.toBe("slot_302");
        }
      }
    });

    it("excludes off-duty technicians from returned availability", () => {
      // Frank Alvarez (tech_06) is HVAC in Austin-East but OFF_DUTY
      const result = service.checkAvailability({
        serviceType: "HVAC",
        serviceZone: "Austin-East",
        date: "2026-09-18"
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const frankSlot = result.data.slots.find((s) => s.technicianId === "tech_06");
        expect(frankSlot).toBeUndefined();
      }
    });

    it("filters availability by preferred time window", () => {
      const result = service.checkAvailability({
        serviceType: "HVAC",
        serviceZone: "Austin-South",
        date: "2026-09-18",
        preferredWindow: {
          start: "13:00:00Z",
          end: "15:00:00Z"
        }
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const slot of result.data.slots) {
          expect(slot.startAt.includes("13:00:00Z")).toBe(true);
        }
      }
    });
  });

  describe("3. create_work_order & idempotency", () => {
    it("successfully creates a work order for an available slot and marks slot booked", () => {
      // First find an available slot
      const avail = service.checkAvailability({
        serviceType: "HVAC",
        serviceZone: "Austin-South",
        date: "2026-09-18"
      });
      expect(avail.ok).toBe(true);
      if (!avail.ok) return;

      const targetSlot = avail.data.slots[0];

      const createResult = service.createWorkOrder({
        idempotencyKey: "idem_test_create_001",
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "Air conditioner leaking condensation water",
        urgency: "STANDARD",
        slotId: targetSlot.slotId,
        createdBy: "VOICE_AGENT"
      });

      expect(createResult.ok).toBe(true);
      if (createResult.ok) {
        expect(createResult.data.workOrder.id).toBeDefined();
        expect(createResult.data.workOrder.status).toBe("BOOKED");
        expect(createResult.data.workOrder.scheduledStart).toBe(targetSlot.startAt);

        // Slot must now be marked BOOKED in store
        const storeSlot = service.getStore().slots.get(targetSlot.slotId);
        expect(storeSlot?.status).toBe("BOOKED");
      }

      // Verify idempotency: calling with identical idempotencyKey returns exact same work order
      const replayResult = service.createWorkOrder({
        idempotencyKey: "idem_test_create_001",
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "Air conditioner leaking condensation water",
        urgency: "STANDARD",
        slotId: targetSlot.slotId,
        createdBy: "VOICE_AGENT"
      });

      expect(replayResult.ok).toBe(true);
      if (replayResult.ok && createResult.ok) {
        expect(replayResult.data.workOrder.id).toBe(createResult.data.workOrder.id);
      }
    });

    it("rejects booking if slot is already booked (stale slot handling)", () => {
      // slot_301 is already seeded as BOOKED
      const createResult = service.createWorkOrder({
        idempotencyKey: "idem_test_stale_slot",
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "AC not turning on",
        urgency: "HIGH",
        slotId: "slot_301", // Already BOOKED
        createdBy: "VOICE_AGENT"
      });

      expect(createResult.ok).toBe(false);
      if (!createResult.ok) {
        expect(createResult.error.code).toBe("SLOT_UNAVAILABLE");
      }
    });
  });

  describe("4. get_work_order", () => {
    it("retrieves existing work order by id", () => {
      const result = service.getWorkOrder({ workOrderId: "wo_1001" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.workOrder).not.toBeNull();
        expect(result.data.workOrder?.id).toBe("wo_1001");
        expect(result.data.workOrder?.serviceType).toBe("HVAC");
      }
    });

    it("returns null workOrder for unknown id", () => {
      const result = service.getWorkOrder({ workOrderId: "wo_unknown" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.workOrder).toBeNull();
      }
    });
  });

  describe("5. reschedule_work_order", () => {
    it("successfully reschedules a work order to a new available slot", () => {
      // Find available slot for wo_1003 (Plumbing in Austin-South)
      const avail = service.checkAvailability({
        serviceType: "PLUMBING",
        serviceZone: "Austin-South",
        date: "2026-09-19"
      });
      expect(avail.ok).toBe(true);
      if (!avail.ok) return;

      const newSlot = avail.data.slots[0];

      const reschedResult = service.rescheduleWorkOrder({
        idempotencyKey: "idem_resched_test_1",
        workOrderId: "wo_1003",
        newSlotId: newSlot.slotId
      });

      expect(reschedResult.ok).toBe(true);
      if (reschedResult.ok) {
        expect(reschedResult.data.workOrder.scheduledStart).toBe(newSlot.startAt);
        expect(reschedResult.data.workOrder.status).toBe("BOOKED");
        // New slot must now be BOOKED
        expect(service.getStore().slots.get(newSlot.slotId)?.status).toBe("BOOKED");
      }
    });

    it("fails when target slot is already booked and does not alter original booking", () => {
      const originalWO = service.getStore().workOrders.get("wo_1003");
      const originalStart = originalWO?.scheduledStart;

      const reschedResult = service.rescheduleWorkOrder({
        idempotencyKey: "idem_resched_fail_taken",
        workOrderId: "wo_1003",
        newSlotId: "slot_301" // Already BOOKED
      });

      expect(reschedResult.ok).toBe(false);
      if (!reschedResult.ok) {
        expect(reschedResult.error.code).toBe("SLOT_UNAVAILABLE");
      }

      // Original appointment start remains intact
      expect(service.getStore().workOrders.get("wo_1003")?.scheduledStart).toBe(originalStart);
    });
  });

  describe("6. cancel_work_order", () => {
    it("cancels work order and releases the booked slot back to AVAILABLE", () => {
      const wo = service.getStore().workOrders.get("wo_1003")!;
      const scheduledStart = wo.scheduledStart;

      // Find slot corresponding to this work order
      let assignedSlot = Array.from(service.getStore().slots.values()).find(
        (s) => s.technicianId === wo.technicianId && s.startAt === scheduledStart
      );
      if (assignedSlot) {
        assignedSlot.status = "BOOKED";
      }

      const cancelResult = service.cancelWorkOrder({
        idempotencyKey: "idem_cancel_001",
        workOrderId: "wo_1003",
        reason: "Customer rescheduled with landlord"
      });

      expect(cancelResult.ok).toBe(true);
      if (cancelResult.ok) {
        expect(cancelResult.data.workOrder.status).toBe("CANCELLED");
      }

      // Slot should now be released back to AVAILABLE
      if (assignedSlot) {
        expect(service.getStore().slots.get(assignedSlot.id)?.status).toBe("AVAILABLE");
      }
    });

    it("is idempotent: repeat cancellation returns identical cancelled work order", () => {
      const first = service.cancelWorkOrder({
        idempotencyKey: "idem_cancel_repeat",
        workOrderId: "wo_1002"
      });
      expect(first.ok).toBe(true);

      const second = service.cancelWorkOrder({
        idempotencyKey: "idem_cancel_repeat",
        workOrderId: "wo_1002"
      });
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(second.data.workOrder.id).toBe(first.data.workOrder.id);
        expect(second.data.workOrder.status).toBe("CANCELLED");
      }
    });
  });
});
