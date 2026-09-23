import { describe, it, expect } from "vitest";
import { maskSecret, sanitizeInputString, verifyWebhookSignature } from "@dispatchai/shared";
import { handleRequest } from "./worker.js";

describe("Phase 8: Security Hardening Test Suite", () => {
  it("rejects a protected voice tool request when the secret header is missing", async () => {
    const req = new Request("http://localhost/api/voice/tools/find_customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "5125550101" })
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(401);
  });

  it("Scenario 1: Unauthenticated request with invalid x-dispatch-secret is rejected with 401", async () => {
    const req = new Request("http://localhost/api/voice/tools/find_customer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatch-secret": "INVALID_SECRET_ATTEMPT"
      },
      body: JSON.stringify({ phone: "5125550101" })
    });

    const res = await handleRequest(req);
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("Scenario 2: Mask secret helper sanitizes sensitive credentials for logging", () => {
    expect(maskSecret("dev_secret_dispatch_2026")).toBe("dev***026");
    expect(maskSecret("12345")).toBe("***");
    expect(maskSecret("")).toBe("");
  });

  it("Scenario 3: Input sanitization strips control characters and trims text", () => {
    const malicious = "  Hello \u0000World\u0007!  ";
    const clean = sanitizeInputString(malicious);
    expect(clean).toBe("Hello World!");
  });

  it("Scenario 4: HMAC SHA-256 webhook signature verification verifies authentic payloads", async () => {
    const payload = JSON.stringify({ event: "work_order_created", id: "wo_1001" });
    const secret = "secret_hmac_key_2026";

    // Generate valid HMAC SHA-256 signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const bodyData = encoder.encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, bodyData);
    const validSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const isValid = await verifyWebhookSignature(payload, validSignature, secret);
    expect(isValid).toBe(true);

    const isFakeValid = await verifyWebhookSignature(payload, "0000000000000000000000000000000000000000000000000000000000000000", secret);
    expect(isFakeValid).toBe(false);
  });
});
