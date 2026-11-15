// Who is calling, for the rate limiter. A header the caller can set is worthless for this, so the address comes from
// the connection. Behind a proxy that you run yourself (Caddy, a tunnel), every connection comes from the proxy, so
// with TRUST_PROXY on we take the first address in X-Forwarded-For, which that proxy writes.
export function clientIp(remoteAddress: string | undefined, forwardedFor: string | undefined, trustProxy: boolean): string {
  const forwarded = forwardedFor?.split(",")[0]?.trim();
  return (trustProxy && forwarded) || remoteAddress || "local";
}

// Our own tunnel (cloudflared) connects from this computer, so every visitor would look like 127.0.0.1 and share one
// rate-limit bucket. While the tunnel is running, a loopback connection is that tunnel, and its forwarded address is trusted.
export const isLoopback = (address: string | undefined) => !!address && /^(127\.|::1$|::ffff:127\.)/.test(address);
