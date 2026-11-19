/**
 * In-memory fixed-window limiter (per process). Use a shared store (Redis) when scaling horizontally.
 * Memory is bounded (Codex P2): expired buckets are swept periodically and whenever the table reaches its cap;
 * if it is still full of live buckets, the oldest are evicted (Map keeps insertion order). Callers that accept
 * attacker-chosen keys (e.g. login e-mails) must check a coarse limit (global / per-IP) FIRST so rejected
 * requests never allocate fine-grained buckets.
 */
const buckets = new Map<string, { count: number; reset: number }>();
const MAX_KEYS = Math.max(1000, Number(process.env.RATE_LIMIT_MAX_KEYS ?? 50_000));
const SWEEP_EVERY_MS = 60_000;
let lastSweep = 0;

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  lastSweep = now;
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - lastSweep > SWEEP_EVERY_MS || buckets.size >= MAX_KEYS) sweep(now);
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    if (b) buckets.delete(key);
    while (buckets.size >= MAX_KEYS) buckets.delete(buckets.keys().next().value as string); // oldest first
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

/** Test/diagnostic helpers. */
export const rateLimitStats = () => ({ keys: buckets.size, maxKeys: MAX_KEYS });
export function __resetRateLimits() { buckets.clear(); lastSweep = 0; }
