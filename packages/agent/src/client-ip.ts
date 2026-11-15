// Who is calling, for the rate limiter. A header the caller can set is worthless for this, so the address comes from
// the connection. Behind a proxy that you run yourself (Caddy, a tunnel), every connection comes from the proxy, so
// with TRUST_PROXY on we take the first address in X-Forwarded-For, which that proxy writes.
export function clientIp(remoteAddress: string | undefined, forwardedFor: string | undefined, trustProxy: boolean): string {
  const forwarded = forwardedFor?.split(",")[0]?.trim();
  return (trustProxy && forwarded) || remoteAddress || "local";
}

// Our own tunnel (cloudflared) connects from this computer, so every visitor would look like 127.0.0.1 and share one
// rate-limit bucket.
export const isLoopback = (address: string | undefined) => !!address && /^(127\.|::1$|::ffff:127\.)/.test(address);

// Behind Cloudflare, X-Forwarded-For is NOT safe for this: a visitor can send their own value and it arrives first, with
// the real address appended last (checked on a real quick tunnel: a forged "9.9.9.9" came first, the real IP last).
// Cloudflare itself sets CF-Connecting-IP and answers 403 to a request that forges it (checked the same way), so that
// header is trusted, and only on a loopback connection, which can only be our own cloudflared.
export function tunnelVisitorIp(remoteAddress: string | undefined, cfConnectingIp: string | undefined): string | undefined {
  return isLoopback(remoteAddress) ? cfConnectingIp?.trim() || undefined : undefined;
}
