/**
 * Security utilities: Secret masking, Webhook signature verification, and input sanitization.
 */

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 6) return "***";
  return `${secret.substring(0, 3)}***${secret.substring(secret.length - 3)}`;
}

export function sanitizeInputString(input: string): string {
  if (typeof input !== "string") return "";
  // Strip control characters while preserving normal unicode text
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/**
 * Basic HMAC signature verification for external webhooks (e.g. ElevenLabs, n8n)
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const bodyData = encoder.encode(rawBody);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify", "sign"]
    );

    // Convert hex signature to ArrayBuffer
    const hexPattern = signature.replace(/^sha256=/i, "");
    if (hexPattern.length !== 64) return false;

    const signatureBytes = new Uint8Array(
      hexPattern.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify("HMAC", cryptoKey, signatureBytes, bodyData);
  } catch (err) {
    return false;
  }
}

// Outbound event signing: HMAC-SHA256 over "<timestamp>.<body>", sent as "sha256=<hex>".
export async function signEvent(body: string, timestamp: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`)));
  return `sha256=${[...mac].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

// Receiver side. Rejects tampered bodies and timestamps outside the window (replay protection).
export async function verifyEventSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string,
  now = Date.now(),
  windowMs = 5 * 60 * 1000
): Promise<boolean> {
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(now - sent * 1000) > windowMs) return false;
  return verifyWebhookSignature(`${timestamp}.${body}`, signature, secret);
}
