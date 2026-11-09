import "server-only";

/**
 * Simple in-memory rate limit: at most `limit` requests per `windowMs` per key.
 *
 * Good enough for one server process (local dev, a single instance). On
 * Vercel each serverless instance has its own memory, so this is a speed
 * bump, not a guarantee. Phase 2b/7 moves the counter to Supabase together
 * with per-user limits (PLAN.md §9).
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  // Keep memory bounded.
  if (buckets.size > 5_000) {
    for (const [k, times] of buckets) if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  // Hard cap, so a flood of made-up keys (e.g. random emails on /login) can't
  // grow memory without limit: drop the oldest keys first (Map keeps insertion order).
  if (buckets.size > 20_000) {
    for (const k of buckets.keys()) {
      if (buckets.size <= 15_000) break;
      buckets.delete(k);
    }
  }
  return true;
}
