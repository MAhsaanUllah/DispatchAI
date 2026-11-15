import { describe, expect, it } from "vitest";
import { activeKeys, curlExample, isLocalOnly, tunnelAddress, type KeyRow } from "./ConnectPanel.js";

const row = (over: Partial<KeyRow>): KeyRow => ({ id: "1", name: "k", scope: "read", last4: "abcd", createdAt: "2026-01-01T00:00:00Z", ...over });

describe("connect panel helpers", () => {
  it("counts only keys that are not revoked", () => {
    expect(activeKeys([row({}), row({ id: "2", revokedAt: "2026-02-01T00:00:00Z" })])).toHaveLength(1);
  });
  it("reads the tunnel address from the status text", () => {
    expect(tunnelAddress("Online at https://x.trycloudflare.com")).toBe("https://x.trycloudflare.com");
    expect(tunnelAddress("Online at https://x.example.com.")).toBe("https://x.example.com");
    expect(tunnelAddress("Starting…")).toBeUndefined();
    expect(tunnelAddress(undefined)).toBeUndefined();
  });
  it("knows which addresses only work on this computer", () => {
    for (const a of ["http://localhost:8787", "http://127.0.0.1:1", "http://[::1]:2"]) expect(isLocalOnly(a), a).toBe(true);
    expect(isLocalOnly("https://bookings.example.com")).toBe(false);
  });
  it("builds the curl example from the address", () => {
    expect(curlExample("https://a.b")).toBe('curl -H "Authorization: Bearer YOUR_KEY" https://a.b/api/v1/bookings');
  });
});
