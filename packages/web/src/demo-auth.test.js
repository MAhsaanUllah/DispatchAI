import { describe, expect, it } from "vitest";
import { DemoAccess, handleDemoRequest } from "../demo-auth.js";

const DAY = 86400000;
const future = () => Date.now() + DAY;
const admin = "admin-secret";

function storageStub() {
  const map = new Map();
  return {
    map,
    get: async (key) => map.get(key),
    put: async (key, value) => { map.set(key, value); },
    delete: async (key) => { map.delete(key); }
  };
}

function makeAccess() {
  const storage = storageStub();
  return { storage, access: new DemoAccess({ storage }, {}) };
}

const envWithAdmin = () => {
  const stores = new Map();
  const forName = (name) => {
    if (!stores.has(name)) stores.set(name, makeAccess());
    return stores.get(name);
  };
  return {
    stores,
    forName,
    env: {
      DEMO_ADMIN_SECRET: admin,
      DEMO_ACCESS: { getByName: (name) => forName(name).access }
    }
  };
};

const seedAccount = async (forName, email, { callsUsed = 0, activeCall } = {}) => {
  const { storage } = forName(`email:${email}`);
  await storage.put("callsUsed", callsUsed);
  if (activeCall) await storage.put("activeCall", activeCall);
  return storage;
};

describe("DemoAccess invite redemption", () => {
  it("admits distinct Google accounts up to the invite cap and rejects beyond it", async () => {
    const { access } = makeAccess();
    await access.createInvite("", future(), 3);
    expect(await access.redeemInvite("a@example.test")).toBe(true);
    expect(await access.redeemInvite("b@example.test")).toBe(true);
    expect(await access.redeemInvite("c@example.test")).toBe(true);
    expect(await access.redeemInvite("d@example.test")).toBe(false);
  });

  it("lets an already-admitted reviewer sign in again without consuming a slot", async () => {
    const { access } = makeAccess();
    await access.createInvite("", future(), 2);
    expect(await access.redeemInvite("a@example.test")).toBe(true);
    expect(await access.redeemInvite("a@example.test")).toBe(true);
    expect(await access.redeemInvite("b@example.test")).toBe(true);
    expect(await access.redeemInvite("c@example.test")).toBe(false);
  });

  it("keeps the invite bound to its invited email when one is set", async () => {
    const { access } = makeAccess();
    await access.createInvite("owner@example.test", future(), 5);
    expect(await access.redeemInvite("someone@example.test")).toBe(false);
    expect(await access.redeemInvite("owner@example.test")).toBe(true);
    expect(await access.redeemInvite("owner@example.test")).toBe(true);
  });

  it("rejects an expired invite", async () => {
    const { access } = makeAccess();
    await access.createInvite("", Date.now() - 1000, 5);
    expect(await access.redeemInvite("a@example.test")).toBe(false);
  });

  it("keeps a legacy fully-redeemed invite closed", async () => {
    const { storage, access } = makeAccess();
    await storage.put("invite", { email: "", expiresAt: future(), used: true });
    expect(await access.redeemInvite("a@example.test")).toBe(false);
  });

  it("upgrades a legacy unused invite for multiple reviewers", async () => {
    const { storage, access } = makeAccess();
    await storage.put("invite", { email: "", expiresAt: future(), used: false });
    expect(await access.redeemInvite("a@example.test")).toBe(true);
    expect(await access.redeemInvite("b@example.test")).toBe(true);
    expect(storage.map.get("invite")).toMatchObject({ used: true, maxRedemptions: 10 });
    expect(storage.map.get("invite").redeemedBy).toEqual(["a@example.test", "b@example.test"]);
  });
});

describe("demo call admission", () => {
  it("reports an active call while another call holds the lock", async () => {
    const { access } = makeAccess();
    expect(await access.beginCall("voice_1")).toBe("ok");
    expect(await access.beginCall("voice_2")).toBe("active");
  });

  it("admits a new call after the previous one ends", async () => {
    const { access } = makeAccess();
    expect(await access.beginCall("voice_1")).toBe("ok");
    await access.endCall("voice_1");
    expect(await access.beginCall("voice_2")).toBe("ok");
  });

  it("reports the limit after two calls, even when each ended cleanly", async () => {
    const { access } = makeAccess();
    expect(await access.beginCall("voice_1")).toBe("ok");
    await access.endCall("voice_1");
    expect(await access.beginCall("voice_2")).toBe("ok");
    await access.endCall("voice_2");
    expect(await access.beginCall("voice_3")).toBe("limit");
  });
});

describe("invite creation route", () => {
  const postInvite = (body, headers = {}) =>
    new Request("https://demo.test/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
  const tokenOf = (url) => new URL(url).searchParams.get("invite");

  it("requires the admin secret", async () => {
    const { env } = envWithAdmin();
    const response = await handleDemoRequest(postInvite({}), env);
    expect(response.status).toBe(401);
  });

  it("stores the requested reviewer cap and falls back to the default when out of range", async () => {
    const { stores, env } = envWithAdmin();
    const withCap = await handleDemoRequest(postInvite({ maxRedemptions: 4 }, { "x-demo-admin-secret": admin }), env);
    expect(withCap.status).toBe(201);
    const token = tokenOf((await withCap.json()).url);
    expect(stores.get(`invite:${token}`).storage.map.get("invite")).toMatchObject({ used: false, maxRedemptions: 4 });

    const clamped = await handleDemoRequest(postInvite({ maxRedemptions: 99 }, { "x-demo-admin-secret": admin }), env);
    const clampedToken = tokenOf((await clamped.json()).url);
    expect(stores.get(`invite:${clampedToken}`).storage.map.get("invite")).toMatchObject({ maxRedemptions: 10 });
  });

  it("rejects an invalid invited email", async () => {
    const { env } = envWithAdmin();
    const response = await handleDemoRequest(postInvite({ email: "not-an-email" }, { "x-demo-admin-secret": admin }), env);
    expect(response.status).toBe(400);
  });
});

describe("admin quota route", () => {
  const postQuota = (body, headers = {}) =>
    new Request("https://demo.test/api/admin/quota", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    });

  it("requires the admin secret", async () => {
    const { env } = envWithAdmin();
    expect((await handleDemoRequest(postQuota({ email: "a@example.test" }), env)).status).toBe(401);
  });

  it("rejects an invalid email", async () => {
    const { env } = envWithAdmin();
    const response = await handleDemoRequest(postQuota({ email: "nope" }, { "x-demo-admin-secret": admin }), env);
    expect(response.status).toBe(400);
  });

  it("reads quota state without changing it", async () => {
    const { forName, env } = envWithAdmin();
    const storage = await seedAccount(forName, "a@example.test", { callsUsed: 1 });
    const response = await handleDemoRequest(postQuota({ email: "a@example.test" }, { "x-demo-admin-secret": admin }), env);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ email: "a@example.test", callsUsed: 1, activeCallRemainingMs: 0 });
    expect(await storage.get("callsUsed")).toBe(1);
  });

  it("reports the remaining lock time of an active call", async () => {
    const { forName, env } = envWithAdmin();
    await seedAccount(forName, "a@example.test", { callsUsed: 2, activeCall: { sessionId: "voice_1", expiresAt: Date.now() + 600000 } });
    const body = await (await handleDemoRequest(postQuota({ email: "a@example.test" }, { "x-demo-admin-secret": admin }), env)).json();
    expect(body.callsUsed).toBe(2);
    expect(body.activeCallRemainingMs).toBeGreaterThan(590000);
    expect(body.activeCallRemainingMs).toBeLessThanOrEqual(600000);
  });

  it("resets the quota and clears the active-call lock", async () => {
    const { forName, env } = envWithAdmin();
    const storage = await seedAccount(forName, "a@example.test", { callsUsed: 2, activeCall: { sessionId: "voice_1", expiresAt: Date.now() + 600000 } });
    const body = await (await handleDemoRequest(postQuota({ email: "a@example.test", callsUsed: 0, clearActive: true }, { "x-demo-admin-secret": admin }), env)).json();
    expect(body).toMatchObject({ callsUsed: 0, activeCallRemainingMs: 0 });
    expect(await storage.get("callsUsed")).toBe(0);
    expect(await storage.get("activeCall")).toBeUndefined();
    expect(await forName("email:a@example.test").access.beginCall("voice_2")).toBe("ok");
  });
});
