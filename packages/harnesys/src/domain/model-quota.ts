import type { QuotaAdmission, QuotaBucket } from '../ports/model-quota.ts';
import type { ModelRateLimits } from '../ports/models.ts';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface QuotaBucketState {
  windowStartMs: number;
  requests: number;
  tokens: number;
  reservedRequests: number;
  reservedTokens: number;
}
export interface QuotaKeyState {
  buckets: Map<QuotaBucket, QuotaBucketState>;
  reservations: Map<string, { estTokens: number }>;
}
export interface QuotaState {
  keys: Map<string, QuotaKeyState>;
}
export function emptyQuotaState(): QuotaState {
  return { keys: new Map() };
}
export function bucketWindowStartMs(bucket: QuotaBucket, nowMs: number): number {
  if (bucket === 'rpd' || bucket === 'tpd') {
    return Math.floor(nowMs / DAY_MS) * DAY_MS;
  }
  return Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
}
function windowEndMs(bucket: QuotaBucket, nowMs: number): number {
  return (
    bucketWindowStartMs(bucket, nowMs) + (bucket === 'rpd' || bucket === 'tpd' ? DAY_MS : MINUTE_MS)
  );
}
function keyStateOf(state: QuotaState, key: string): QuotaKeyState {
  const existing = state.keys.get(key);
  if (existing) {
    return existing;
  }
  const fresh: QuotaKeyState = { buckets: new Map(), reservations: new Map() };
  state.keys.set(key, fresh);
  return fresh;
}
function bucketStateOf(
  keyState: QuotaKeyState,
  bucket: QuotaBucket,
  nowMs: number,
): QuotaBucketState {
  const start = bucketWindowStartMs(bucket, nowMs);
  const existing = keyState.buckets.get(bucket);
  if (existing && existing.windowStartMs === start) {
    return existing;
  }
  const fresh: QuotaBucketState = {
    windowStartMs: start,
    requests: 0,
    tokens: 0,
    reservedRequests: 0,
    reservedTokens: 0,
  };
  keyState.buckets.set(bucket, fresh);
  return fresh;
}
interface BucketPlan {
  state: QuotaBucketState;
  tokens: boolean;
  est: number;
}
interface AdmissionPlan {
  entries: BucketPlan[];
  waitMs: number;
  reason?: QuotaBucket;
}
interface BucketVerdict {
  blockedMs?: number;
  entry?: BucketPlan;
}
function evaluateBucket(
  keyState: QuotaKeyState,
  bucket: QuotaBucket,
  limit: number,
  est: number,
  nowMs: number,
): BucketVerdict {
  const isToken = bucket === 'tpm' || bucket === 'tpd';
  const checkEst = isToken ? est : 1;
  if (checkEst > limit) {
    return {};
  }
  const bucketState = bucketStateOf(keyState, bucket, nowMs);
  const used = isToken
    ? bucketState.tokens + bucketState.reservedTokens
    : bucketState.requests + bucketState.reservedRequests;
  if (used + checkEst > limit) {
    return { blockedMs: windowEndMs(bucket, nowMs) - nowMs };
  }
  return { entry: { state: bucketState, tokens: isToken, est: checkEst } };
}
function collectPlan(
  keyState: QuotaKeyState,
  limits: ModelRateLimits,
  est: number,
  nowMs: number,
): AdmissionPlan {
  const limitsOf: [QuotaBucket, number | undefined][] = [
    ['rpm', limits.rpm],
    ['rpd', limits.rpd],
    ['tpm', limits.tpm],
    ['tpd', limits.tpd],
  ];
  const entries: BucketPlan[] = [];
  let waitMs = 0;
  let reason: QuotaBucket | undefined;
  for (const [bucket, limit] of limitsOf) {
    if (limit === undefined || limit <= 0) {
      continue;
    }
    const verdict = evaluateBucket(keyState, bucket, limit, est, nowMs);
    if (verdict.blockedMs !== undefined) {
      if (verdict.blockedMs >= waitMs) {
        waitMs = verdict.blockedMs;
        reason = bucket;
      }
      continue;
    }
    if (verdict.entry) {
      entries.push(verdict.entry);
    }
  }
  return { entries, waitMs, reason };
}
export function admitQuota(
  input: {
    state: QuotaState;
    key: string;
    limits: ModelRateLimits;
    estTokens: number;
    reservationId: string;
  },
  nowMs: number,
): QuotaAdmission {
  const keyState = keyStateOf(input.state, input.key);
  const est = Math.max(0, Math.round(input.estTokens));
  const { entries, waitMs, reason } = collectPlan(keyState, input.limits, est, nowMs);
  if (reason !== undefined) {
    return { granted: false, waitMs: Math.max(1, waitMs), reason };
  }
  for (const entry of entries) {
    if (entry.tokens) {
      entry.state.reservedTokens += entry.est;
    } else {
      entry.state.reservedRequests += 1;
    }
  }
  keyState.reservations.set(input.reservationId, { estTokens: est });
  return { granted: true, reservation: input.reservationId };
}
export function settleQuota(
  state: QuotaState,
  key: string,
  reservationId: string,
  actualTokens: number | undefined,
  nowMs: number,
): void {
  const keyState = state.keys.get(key);
  if (!keyState) {
    return;
  }
  const reservation = keyState.reservations.get(reservationId);
  if (!reservation) {
    return;
  }
  keyState.reservations.delete(reservationId);
  for (const bucket of ['rpm', 'rpd'] as QuotaBucket[]) {
    const bucketState = keyState.buckets.get(bucket);
    if (!bucketState) {
      continue;
    }
    bucketState.reservedRequests = Math.max(0, bucketState.reservedRequests - 1);
    if (
      actualTokens !== undefined &&
      bucketState.windowStartMs === bucketWindowStartMs(bucket, nowMs)
    ) {
      bucketState.requests += 1;
    }
  }
  for (const bucket of ['tpm', 'tpd'] as QuotaBucket[]) {
    const bucketState = keyState.buckets.get(bucket);
    if (!bucketState) {
      continue;
    }
    bucketState.reservedTokens = Math.max(0, bucketState.reservedTokens - reservation.estTokens);
    if (
      actualTokens !== undefined &&
      bucketState.windowStartMs === bucketWindowStartMs(bucket, nowMs)
    ) {
      bucketState.tokens += Math.max(0, Math.round(actualTokens));
    }
  }
}
