/**
 * Client IP for rate limiting (P3). `X-Forwarded-For` is client-controlled unless a trusted reverse proxy
 * overwrites/appends it, so it is only used when TRUST_PROXY_HOPS is configured: with N trusted proxies in
 * front of the app, the client address is the N-th entry from the RIGHT (entries further left are spoofable).
 * Without that configuration a constant bucket is used — per-account limits still apply.
 */
export function clientIp(h: Pick<Headers, "get">, trustedHops = Number(process.env.TRUST_PROXY_HOPS ?? 0)): string {
  if (!(Number.isInteger(trustedHops) && trustedHops > 0)) return "untrusted-proxy";
  const chain = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = chain[chain.length - trustedHops];
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "unknown";
}
