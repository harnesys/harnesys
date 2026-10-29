const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

const buckets = new Map<string, number[]>();

export function checkInviteRateLimit(orgId: string): boolean {
  const now = Date.now();
  const prior = buckets.get(orgId) ?? [];
  const recent = prior.filter((ts) => now - ts < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    buckets.set(orgId, recent);
    return false;
  }
  recent.push(now);
  buckets.set(orgId, recent);
  return true;
}
