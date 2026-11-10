const WINDOW_MS = 60_000;
const MAX_TOKENS = 120;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class WebhookRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  take(key: string, now: number): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: MAX_TOKENS, updatedAt: now };
    const refill = ((now - bucket.updatedAt) / WINDOW_MS) * MAX_TOKENS;
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + refill);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 5_000) {
      this.prune(now);
    }
    return true;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > WINDOW_MS * 5) {
        this.buckets.delete(key);
      }
    }
  }
}
