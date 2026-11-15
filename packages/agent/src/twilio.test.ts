import { afterEach, describe, expect, it } from "vitest";
import { BusinessConfigSchema } from "@dispatchai/shared";
import { getBusinessConfig, setBusinessConfig } from "@dispatchai/domain";
import { isOpenNow, twilioSignature, verifyTwilioSignature } from "./twilio.js";
import { getOrCreateAgent, handleRequest } from "./worker.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const PUBLIC = "https://bookings.example.test";
const allDay = { open: "00:00", close: "23:59" };
const alwaysOpen = { sun: allDay, mon: allDay, tue: allDay, wed: allDay, thu: allDay, fri: allDay, sat: allDay };

afterEach(() => setBusinessConfig(undefined));

describe("Twilio signature", () => {
  it("accepts Twilio's signature and rejects a changed parameter or URL", () => {
    const params = { CallSid: "CA1", From: "+15125550101", SpeechResult: "hello" };
    const sig = twilioSignature(TOKEN, `${PUBLIC}/api/twilio/voice`, params);
    expect(verifyTwilioSignature(TOKEN, `${PUBLIC}/api/twilio/voice`, params, sig)).toBe(true);
    expect(verifyTwilioSignature(TOKEN, `${PUBLIC}/api/twilio/voice`, { ...params, SpeechResult: "cancel everything" }, sig)).toBe(false);
    expect(verifyTwilioSignature(TOKEN, `${PUBLIC}/other`, params, sig)).toBe(false);
    expect(verifyTwilioSignature(TOKEN, `${PUBLIC}/api/twilio/voice`, params, null)).toBe(false);
  });

  it("knows opening hours in the business time zone", () => {
    const config = BusinessConfigSchema.parse({ ...getBusinessConfig("salon"), timeZone: "Asia/Karachi" });
    expect(isOpenNow(config, new Date("2026-11-09T05:00:00Z"))).toBe(true); // Monday 10:00 Karachi
    expect(isOpenNow(config, new Date("2026-11-09T13:00:00Z"))).toBe(false); // Monday 18:00
    expect(isOpenNow(config, new Date("2026-11-08T05:00:00Z"))).toBe(false); // Sunday
  });
});

describe("phone line webhook", () => {
  const api = async (path: string, init: RequestInit = {}) => {
    const res = await handleRequest(new Request(`http://localhost${path}`, { headers: { "Content-Type": "application/json" }, ...init }));
    return { status: res.status, body: (await res.json()) as any };
  };
  const connect = (staffPhone = "") => api("/api/plugins/twilio", { method: "PUT", body: JSON.stringify({
    enabled: true, values: { accountSid: `AC${"0".repeat(32)}`, authToken: TOKEN, phoneNumber: "+15550001111", staffPhone, publicUrl: PUBLIC }
  }) });
  // A Twilio request as it arrives at the server (internal URL) but signed for the public URL.
  const twilio = async (params: Record<string, string>, signature = twilioSignature(TOKEN, `${PUBLIC}/api/twilio/voice`, params)) => {
    const res = await handleRequest(new Request("http://localhost:8787/api/twilio/voice", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": signature }, body: new URLSearchParams(params).toString()
    }));
    return { status: res.status, text: await res.text() };
  };

  it("needs https for the public address", async () => {
    const res = await api("/api/plugins/twilio", { method: "PUT", body: JSON.stringify({ enabled: true, values: { accountSid: `AC${"0".repeat(32)}`, authToken: TOKEN, phoneNumber: "+15550001111", publicUrl: "http://localhost:8787" } }) });
    expect(res.status).toBe(400);
  });

  it("rejects unsigned and forged requests", async () => {
    expect((await connect()).status).toBe(200);
    expect((await twilio({ CallSid: "CA_forged", From: "+1555" }, "bad")).status).toBe(403);
    expect((await twilio({ CallSid: "CA_forged", From: "+1555" }, "")).status).toBe(403);
  });

  it("books an appointment over a recorded call", async () => {
    await connect();
    const call = (SpeechResult?: string) => twilio({ CallSid: "CA_book", From: "+15125550101", ...(SpeechResult === undefined ? {} : { SpeechResult }) });
    const greeting = await call();
    expect(greeting.text).toMatch(/<Gather input="speech".*actionOnEmptyResult="true".*Thanks for calling/);
    // Phone number alone reveals nothing; the caller must state the service address.
    expect((await call("5125550101")).text).toMatch(/please tell me the service address/);
    expect((await call("1402 South Congress Ave")).text).toMatch(/you are verified/);
    expect((await call("My AC is blowing warm air, can you come tomorrow?")).text).toMatch(/openings/);
    const slot = getOrCreateAgent("call_CA_book").getState().availableSlots[0].slotId;
    expect((await call(`Please book ${slot}`)).text).toMatch(/confirm/i);
    const done = await call("yes");
    expect(done.text).toMatch(/confirmed your appointment/);
    expect(getOrCreateAgent("call_CA_book").getState().activeWorkOrder?.status).toBe("BOOKED");
    const calls = (await api("/api/plugins/twilio/calls")).body?.data?.calls;
    // No owner in this test process, so the owner-only calls list answers only for an owner session.
    expect(calls).toBeUndefined();
  });

  it("re-prompts once on silence, then takes a call-back when closed", async () => {
    await connect();
    setBusinessConfig(BusinessConfigSchema.parse({ ...getBusinessConfig("field-service"), hours: { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null } }));
    await twilio({ CallSid: "CA_quiet", From: "+15550009999" });
    expect((await twilio({ CallSid: "CA_quiet", From: "+15550009999", SpeechResult: "" })).text).toMatch(/did not hear anything/);
    const second = await twilio({ CallSid: "CA_quiet", From: "+15550009999", SpeechResult: "" });
    expect(second.text).toMatch(/call you back.*<Hangup\/>/);
    const tasks = (await api("/api/inbox")).body.data.tasks;
    expect(tasks.some((t: { title: string }) => t.title === "Call back: +15550009999")).toBe(true);
  });

  it("forwards a caller who asks for a person to staff while open", async () => {
    await connect("+923001234567");
    setBusinessConfig(BusinessConfigSchema.parse({ ...getBusinessConfig("field-service"), hours: alwaysOpen }));
    await twilio({ CallSid: "CA_human", From: "+15550008888" });
    const res = await twilio({ CallSid: "CA_human", From: "+15550008888", SpeechResult: "I want to speak to a real person" });
    expect(res.text).toMatch(/<Dial>\+923001234567<\/Dial>/);
  });
});
