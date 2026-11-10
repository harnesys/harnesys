import { Injectable } from '@harnesys/brix';
import type { RateSpec } from '../../../domain/addons/host-service.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';

interface TokenBucket {
  tokens: number;
  updatedAt: number;
}

@Injectable()
export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(private readonly clock: ClockPort) {}

  tryAcquire(key: string, rate: RateSpec): boolean {
    const now = this.clock.now();
    const bucket = this.buckets.get(key) ?? { tokens: rate.burst, updatedAt: now };
    const elapsedSec = Math.max(0, now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(rate.burst, bucket.tokens + elapsedSec * rate.perSec);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}

interface QuotaWindow {
  windowStart: number;
  count: number;
}

@Injectable()
export class MinuteQuota {
  private static readonly WINDOW_MS = 60_000;
  private readonly windows = new Map<string, QuotaWindow>();

  constructor(private readonly clock: ClockPort) {}

  tryConsume(key: string, limit: number): boolean {
    const now = this.clock.now();
    const window = this.windows.get(key);
    if (!window || now - window.windowStart >= MinuteQuota.WINDOW_MS) {
      this.windows.set(key, { windowStart: now, count: 1 });
      this.prune(now);
      return true;
    }
    if (window.count >= limit) {
      return false;
    }
    window.count += 1;
    return true;
  }

  private prune(now: number): void {
    if (this.windows.size < 1000) {
      return;
    }
    for (const [key, window] of this.windows) {
      if (now - window.windowStart >= MinuteQuota.WINDOW_MS) {
        this.windows.delete(key);
      }
    }
  }
}
