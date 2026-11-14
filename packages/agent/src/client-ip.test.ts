import { describe, expect, it } from "vitest";
import { clientIp, isLoopback, tunnelVisitorIp } from "./client-ip.js";

describe("rate-limit identity", () => {
  it("behind our own tunnel the visitor is CF-Connecting-IP, not the first X-Forwarded-For", () => {
    // What a real Cloudflare quick tunnel delivered for a visitor who forged X-Forwarded-For: 9.9.9.9.
    const forwardedFor = "9.9.9.9,119.30.116.180";
    expect(clientIp("127.0.0.1", forwardedFor, true)).toBe("9.9.9.9"); // the trap: first value is the visitor's own
    expect(tunnelVisitorIp("127.0.0.1", "119.30.116.180")).toBe("119.30.116.180");
    expect(tunnelVisitorIp("::1", " 203.0.113.7 ")).toBe("203.0.113.7");
    expect(tunnelVisitorIp("::ffff:127.0.0.1", "203.0.113.7")).toBe("203.0.113.7");
  });

  it("is only trusted on a loopback connection, so a LAN or internet client cannot pick its own bucket", () => {
    expect(tunnelVisitorIp("192.168.0.50", "1.2.3.4")).toBeUndefined();
    expect(tunnelVisitorIp("203.0.113.9", "1.2.3.4")).toBeUndefined();
    expect(tunnelVisitorIp(undefined, "1.2.3.4")).toBeUndefined();
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("128.0.0.1")).toBe(false);
  });

  it("without the header it falls back to the connection (the desktop window itself)", () => {
    expect(tunnelVisitorIp("127.0.0.1", undefined)).toBeUndefined();
    expect(tunnelVisitorIp("127.0.0.1", "  ")).toBeUndefined();
    expect(clientIp("127.0.0.1", undefined, false)).toBe("127.0.0.1");
  });
});
