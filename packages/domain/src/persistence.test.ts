import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { DispatchService } from "./service.js";
import { DispatchStore } from "./store.js";

describe("local SQLite state and notification outbox", () => {
  it("keeps bookings, slots, idempotency and notices across restarts", () => {
    const directory = mkdtempSync(join(tmpdir(), "dispatchai-test-"));
    const path = join(directory, "state.sqlite");
    let store: DispatchStore | undefined;
    try {
      store = new DispatchStore(path);
      let service = new DispatchService(store);
      const availability = service.checkAvailability({ serviceType: "HVAC", serviceZone: "Austin-South", date: "2026-09-18" });
      expect(availability.ok).toBe(true);
      if (!availability.ok) return;
      const slotId = availability.data.slots[0].slotId;
      const input = {
        idempotencyKey: "persist-create-1", customerId: "cust_101", propertyId: "prop_201",
        serviceType: "HVAC", issueSummary: "Persistence test", urgency: "STANDARD", slotId, createdBy: "WEB_AGENT"
      };
      const created = service.createWorkOrder(input);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const id = created.data.workOrder.id;
      store.close();

      store = new DispatchStore(path);
      service = new DispatchService(store);
      expect(store.workOrders.get(id)?.status).toBe("BOOKED");
      expect(store.slots.get(slotId)?.status).toBe("BOOKED");
      expect(store.notifications).toHaveLength(2);
      const replay = service.createWorkOrder(input);
      expect(replay.ok && replay.data.workOrder.id).toBe(id);
      expect(store.notifications).toHaveLength(2);
      const next = service.checkAvailability({ serviceType: "HVAC", serviceZone: "Austin-South", date: "2026-09-19" });
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      const moved = service.rescheduleWorkOrder({ idempotencyKey: "persist-move-1", workOrderId: id, newSlotId: next.data.slots[0].slotId });
      expect(moved.ok).toBe(true);
      store.close();

      store = new DispatchStore(path);
      service = new DispatchService(store);
      expect(store.workOrders.get(id)?.scheduledStart).toBe(next.data.slots[0].startAt);
      expect(store.notifications).toHaveLength(4);
      const cancelled = service.cancelWorkOrder({ idempotencyKey: "persist-cancel-1", workOrderId: id });
      expect(cancelled.ok).toBe(true);
      store.close();

      store = new DispatchStore(path);
      expect(store.workOrders.get(id)?.status).toBe("CANCELLED");
      expect(store.notifications).toHaveLength(6);
      expect(store.notifications.every((notice) => notice.status === "PENDING_LOCAL")).toBe(true);
      const originalReplay = new DispatchService(store).createWorkOrder(input);
      expect(originalReplay.ok && originalReplay.data.workOrder.status).toBe("BOOKED");
      expect(store.notifications).toHaveLength(6);
      store.reset();
      expect(store.notifications).toHaveLength(0);
      expect(store.workOrders.has(id)).toBe(false);
    } finally {
      store?.close();
      if (resolve(directory).startsWith(resolve(tmpdir()) + sep)) rmSync(directory, { recursive: true, force: true });
    }
  });
});
