import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createDispatchServer } from "./server.js";

describe("Phase 2: n8n Operational Workflows & Webhook Contracts", () => {
  let server: http.Server;
  let baseUrl: string;
  const validSecret = "test_n8n_secret_2026";

  beforeAll(async () => {
    const instance = createDispatchServer({ secret: validSecret });
    server = instance.server;
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("exposes the local pending outbox only to authenticated callers", async () => {
    const denied = await fetch(`${baseUrl}/api/notifications`);
    expect(denied.status).toBe(401);
    const allowed = await fetch(`${baseUrl}/api/notifications`, {
      headers: { "x-dispatch-secret": validSecret }
    });
    expect(allowed.status).toBe(200);
    const body: any = await allowed.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.notifications)).toBe(true);
  });

  it("does not erase persisted state without explicit reset confirmation", async () => {
    const denied = await fetch(`${baseUrl}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dispatch-secret": validSecret },
      body: "{}"
    });
    expect(denied.status).toBe(400);
    const body: any = await denied.json();
    expect(body.error.code).toBe("CONFIRMATION_REQUIRED");
  });

  describe("Security & Authentication Boundaries", () => {
    it("rejects unauthorized webhook request without secret", async () => {
      const res = await fetch(`${baseUrl}/webhook/customer-lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "5125550101" })
      });

      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects request with invalid secret", async () => {
      const res = await fetch(`${baseUrl}/webhook/customer-lookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": "wrong_secret"
        },
        body: JSON.stringify({ phone: "5125550101" })
      });

      expect(res.status).toBe(401);
    });

    it("accepts request with valid secret via x-dispatch-secret header", async () => {
      const res = await fetch(`${baseUrl}/webhook/customer-lookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({ phone: "5125550101" })
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.customer.firstName).toBe("Alicia");
    });
  });

  describe("Workflow 1 — Customer Lookup", () => {
    it("returns customer and properties for valid phone", async () => {
      const res = await fetch(`${baseUrl}/webhook/customer-lookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({ phone: "5125550102" })
      });

      const json: any = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.customer.lastName).toBe("Thorne");
      expect(json.data.properties.length).toBeGreaterThan(0);
    });

    it("returns null for non-existent customer", async () => {
      const res = await fetch(`${baseUrl}/webhook/customer-lookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({ phone: "5129990000" })
      });

      const json: any = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.customer).toBeNull();
      expect(json.data.properties).toEqual([]);
    });

    it("rejects invalid input schema", async () => {
      const res = await fetch(`${baseUrl}/webhook/customer-lookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({ phone: "123" }) // Too short
      });

      expect(res.status).toBe(400);
      const json: any = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("INVALID_INPUT");
    });
  });

  describe("Workflow 2 — Check Availability", () => {
    it("returns valid available slots for HVAC in Austin-Central", async () => {
      const res = await fetch(`${baseUrl}/webhook/check-availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({
          serviceType: "HVAC",
          serviceZone: "Austin-Central",
          date: "2026-09-18"
        })
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.slots.length).toBeGreaterThan(0);
      expect(json.data.slots[0].slotId).toBeDefined();
    });

    it("rejects unsupported serviceType", async () => {
      const res = await fetch(`${baseUrl}/webhook/check-availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({
          serviceType: "ROOFING",
          serviceZone: "Austin-Central",
          date: "2026-09-18"
        })
      });

      expect(res.status).toBe(400);
      const json: any = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("INVALID_INPUT");
    });
  });

  describe("Workflow 3 — Create Work Order & Idempotency", () => {
    it("creates work order and ensures idempotent replay", async () => {
      // Find slot
      const availRes = await fetch(`${baseUrl}/webhook/check-availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({
          serviceType: "HVAC",
          serviceZone: "Austin-South",
          date: "2026-09-18"
        })
      });
      const availJson: any = await availRes.json();
      const slot = availJson.data.slots[0];

      const payload = {
        idempotencyKey: "idem_n8n_test_101",
        customerId: "cust_101",
        propertyId: "prop_201",
        serviceType: "HVAC",
        issueSummary: "Thermostat unresponsive",
        urgency: "STANDARD",
        slotId: slot.slotId,
        createdBy: "VOICE_AGENT"
      };

      // 1st request
      const createRes1 = await fetch(`${baseUrl}/webhook/create-work-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify(payload)
      });
      expect(createRes1.status).toBe(200);
      const createJson1: any = await createRes1.json();
      expect(createJson1.ok).toBe(true);
      expect(createJson1.data.workOrder.status).toBe("BOOKED");

      // 2nd request with same idempotencyKey (idempotent replay)
      const createRes2 = await fetch(`${baseUrl}/webhook/create-work-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify(payload)
      });
      expect(createRes2.status).toBe(200);
      const createJson2: any = await createRes2.json();
      expect(createJson2.ok).toBe(true);
      expect(createJson2.data.workOrder.id).toBe(createJson1.data.workOrder.id);
    });

    it("rejects booking on unavailable/taken slot", async () => {
      const res = await fetch(`${baseUrl}/webhook/create-work-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({
          idempotencyKey: "idem_n8n_taken_slot",
          customerId: "cust_101",
          propertyId: "prop_201",
          serviceType: "HVAC",
          issueSummary: "AC unit loud buzzing noise",
          urgency: "HIGH",
          slotId: "slot_301", // Booked
          createdBy: "VOICE_AGENT"
        })
      });

      expect(res.status).toBe(400);
      const json: any = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("SLOT_UNAVAILABLE");
    });
  });

  describe("Workflow 4 — Get Work Order", () => {
    it("retrieves work order by workOrderId", async () => {
      const res = await fetch(`${baseUrl}/webhook/get-work-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({ workOrderId: "wo_1001" })
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.workOrder.id).toBe("wo_1001");
    });
  });

  describe("Workflow 5 — Reschedule Work Order", () => {
    it("reschedules work order safely to an available slot", async () => {
      // Find plumbing slot in Austin-South
      const availRes = await fetch(`${baseUrl}/webhook/check-availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({
          serviceType: "PLUMBING",
          serviceZone: "Austin-South",
          date: "2026-09-19"
        })
      });
      const availJson: any = await availRes.json();
      const newSlot = availJson.data.slots[0];

      const res = await fetch(`${baseUrl}/webhook/reschedule-work-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({
          idempotencyKey: "idem_resched_webhook_1",
          workOrderId: "wo_1003",
          newSlotId: newSlot.slotId
        })
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.workOrder.scheduledStart).toBe(newSlot.startAt);
    });
  });

  describe("Workflow 6 — Cancel Work Order", () => {
    it("cancels work order and updates status to CANCELLED", async () => {
      const res = await fetch(`${baseUrl}/webhook/cancel-work-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({
          idempotencyKey: "idem_cancel_webhook_1",
          workOrderId: "wo_1003",
          reason: "Fixed by landlord"
        })
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.workOrder.status).toBe("CANCELLED");
    });
  });

  describe("Showcase Automation — Work Order Created", () => {
    it("executes multi-branch notification automation", async () => {
      const res = await fetch(`${baseUrl}/webhook/automation/work-order-created`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatch-secret": validSecret
        },
        body: JSON.stringify({
          id: "wo_showcase_1",
          serviceType: "HVAC",
          urgency: "HIGH",
          scheduledStart: "2026-09-18T14:00:00Z"
        })
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.ok).toBe(true);
      expect(json.data.automation).toBe("work-order-created-showcase");
      expect(json.data.serviceCategory).toBe("HVAC");
      expect(json.data.customerNoticeStatus).toBe("DISPATCHED_MOCK");
      expect(json.data.dispatchNoticeStatus).toBe("POSTED_MOCK");
    });
  });
});
