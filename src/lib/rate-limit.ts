const buckets = new Map<string, number[]>();

/**
 * A small in-memory sliding-window limiter. Each server instance counts separately, which
 * is enough to slow down scripted abuse of public forms without adding infrastructure.
 * Returns true when the call is allowed.
 */
export function allowRequest(key: string, limit: number, windowMilliseconds: number, now = Date.now()) {
  const recent = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMilliseconds);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10_000) {
    for (const [bucketKey, timestamps] of buckets) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMilliseconds)) buckets.delete(bucketKey);
    }
  }
  return true;
}
