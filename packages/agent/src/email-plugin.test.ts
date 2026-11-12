import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingNotice, DispatchService, getBusinessConfig } from "@dispatchai/domain";
import { deliverBookingEmails } from "../../domain/src/email.js";
import { RESEND_URL } from "./plugins.js";
import { handleRequest } from "./worker.js";

type Sent = { url: string; auth: string; body: { from: string; to: string[]; subject: string; text: string } };
// Fake Resend: records requests to the Resend URL, passes everything else to the real fetch.
function fakeResend(status = 200, message = "") {
  const sent: Sent[] = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) !== RESEND_URL) return realFetch(input, init);
    sent.push({ url: String(input), auth: String((init?.headers as Record<string, string>).Authorization), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(status === 200 ? { id: "email_1" } : { message }), { status });
  });
  return sent;
}
afterEach(() => vi.unstubAllGlobals());

const call = async (path: string, init: RequestInit = {}) => {
  const res = await handleRequest(new Request(`http://localhost${path}`, { headers: { "Content-Type": "application/json", "x-session-id": "email" }, ...init }));
  return { status: res.status, body: (await res.json()) as any };
};
const save = (values: object) => call("/api/plugins/email", { method: "PUT", body: JSON.stringify({ values, enabled: true }) });
const KEY = "re_test_key_123456";

describe("customer email text", () => {
  it("uses the business name, service name and local time, not raw ISO", () => {
    const notice = bookingNotice({ id: "wo_1026", serviceType: "HVAC", scheduledStart: "2026-11-12T15:00:00Z" }, "BOOKED", getBusinessConfig());
    expect(notice.subject).toBe("Booking confirmed · Austin Metro Service Dispatch");
    expect(notice.message).toContain("HVAC appointment (WO-1026)");
    expect(notice.message).toMatch(/Thursday, November 12.*9:00\sAM CST/);
    expect(notice.message).not.toContain("2026-11-12T");
  });
});

describe("Email plugin", () => {
  it("validates the settings before connecting", async () => {
    expect((await save({ apiKey: "x", from: "Shop <a@shop.dev>", testTo: "me@shop.dev" })).status).toBe(400);
    expect((await save({ apiKey: KEY, from: "no-email", testTo: "me@shop.dev" })).status).toBe(400);
    expect((await save({ apiKey: KEY, from: "Shop <a@shop.dev>", testTo: "not-an-email" })).status).toBe(400);
  });

  it("Test sends exactly one email, only to the owner's test address", async () => {
    const sent = fakeResend();
    expect((await save({ apiKey: KEY, from: "Shop <a@shop.dev>", testTo: "me@shop.dev" })).status).toBe(200);
    const test = await call("/api/plugins/email/test", { method: "POST" });
    expect(test.body.data.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].auth).toBe(`Bearer ${KEY}`);
    expect(sent[0].body.to).toEqual(["me@shop.dev"]);
  });

  it("explains a rejected key and an unverified domain in plain words", async () => {
    fakeResend(401, "API key is invalid");
    expect((await call("/api/plugins/email/test", { method: "POST" })).body.data.message).toBe("Resend rejected the API key.");
    vi.unstubAllGlobals();
    fakeResend(403, "The shop.dev domain is not verified");
    expect((await call("/api/plugins/email/test", { method: "POST" })).body.data.message).toMatch(/not verified.*unverified sender domain/);
  });

  it("returns template previews and never the API key", async () => {
    const listed = (await call("/api/plugins")).body.data.plugins.find((p: { id: string }) => p.id === "email");
    expect(listed.preview.map((p: { title: string }) => p.title)).toEqual([
      "Booking confirmed · Austin Metro Service Dispatch", "Appointment updated · Austin Metro Service Dispatch", "Appointment cancelled · Austin Metro Service Dispatch"
    ]);
    expect(JSON.stringify(listed)).not.toContain(KEY);
  });
});

describe("booking emails", () => {
  it("send with the plugin credentials to a real customer address and skip demo addresses", async () => {
    const sent = fakeResend();
    const service = new DispatchService();
    const store = service.getStore();
    store.customers.get("cust_101")!.email = "alicia@customer.dev";
    const avail = service.checkAvailability({ serviceType: "HVAC", serviceZone: "Austin-South", date: "2026-09-18" });
    if (!avail.ok) throw new Error("no slots");
    const created = service.createWorkOrder({ idempotencyKey: "email_1", customerId: "cust_101", propertyId: "prop_201", serviceType: "HVAC", issueSummary: "AC", urgency: "STANDARD", slotId: avail.data.slots[0].slotId, createdBy: "VOICE_AGENT" });
    if (!created.ok) throw new Error("not created");
    await deliverBookingEmails(store, created.data.workOrder.id, { apiKey: KEY, from: "Shop <a@shop.dev>" });
    expect(sent.map((s) => s.body.to[0])).toEqual(["alicia@customer.dev"]);
    expect(sent[0].body.subject).toMatch(/^Booking confirmed/);

    store.customers.get("cust_101")!.email = "alicia@example.com";
    const again = service.createWorkOrder({ idempotencyKey: "email_2", customerId: "cust_101", propertyId: "prop_201", serviceType: "HVAC", issueSummary: "AC", urgency: "STANDARD", slotId: avail.data.slots[1].slotId, createdBy: "VOICE_AGENT" });
    if (!again.ok) throw new Error("not created");
    await deliverBookingEmails(store, again.data.workOrder.id, { apiKey: KEY, from: "Shop <a@shop.dev>" });
    expect(sent).toHaveLength(1);
  });
});
