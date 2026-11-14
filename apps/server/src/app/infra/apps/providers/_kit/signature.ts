import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacSha256(
  value: string | Uint8Array,
  secret: string,
  encoding: 'hex' | 'base64',
): string {
  return createHmac('sha256', secret).update(value).digest(encoding);
}

export function secureCompare(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function timestampWithin(
  timestampSec: number,
  nowMs: number,
  toleranceSec: number,
): boolean {
  return Math.abs(nowMs / 1000 - timestampSec) <= toleranceSec;
}
