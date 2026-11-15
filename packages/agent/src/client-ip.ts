// Who is calling, for the rate limiter. A header the caller can set is worthless for this, so the address comes from
// the connection. Behind a proxy that you run yourself (Caddy, a tunnel), every connection comes from the proxy, so
// with TRUST_PROXY on we take the first address in X-Forwarded-For, which that proxy writes.
export function clientIp(remoteAddress: string | undefined, forwardedFor: string | undefined, trustProxy: boolean): string {
  const forwarded = forwardedFor?.split(",")[0]?.trim();
  return (trustProxy && forwarded) || remoteAddress || "local";
}
