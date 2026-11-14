export const DEFAULT_TTL_SEC = 600;
export const MAX_TTL_SEC = 3600;

export function clampTtl(ttlSec: number): number {
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
    return DEFAULT_TTL_SEC;
  }
  return Math.min(ttlSec, MAX_TTL_SEC);
}
