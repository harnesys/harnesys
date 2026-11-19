import { APICallError, RetryError } from 'ai';
import {
  isRateLimitError,
  isTransientProviderError,
  retryMessage,
} from '../application/provider-error.ts';
import type { StreamChunk } from './ai-llm-chunks.ts';

const RATE_LIMIT_RETRY_DELAYS_MS: [number, ...number[]] = [
  10_000, 20_000, 40_000, 80_000, 160_000, 300_000,
];
const SERVER_ERROR_RETRY_DELAYS_MS: [number, ...number[]] = [
  2_000, 4_000, 8_000, 16_000, 32_000, 60_000,
];
const RATE_LIMIT_FALLBACK_MS = RATE_LIMIT_RETRY_DELAYS_MS[0];
const SERVER_ERROR_FALLBACK_MS = SERVER_ERROR_RETRY_DELAYS_MS[0];
const RETRY_AFTER_MAX_MS = 600_000;
const RETRY_JITTER_RATIO = 0.2;
const RETRY_FLOOR_MS = 1_000;
const SECONDS_TO_MS = 1_000;
interface RetryAfterHeaders {
  'retry-after'?: string;
  'retry-after-ms'?: string;
  'x-ratelimit-reset'?: string;
}
const EPOCH_MS_THRESHOLD = 1e12;
function adviceCandidates(error: unknown): unknown[] {
  const candidates: unknown[] = [error];
  if (RetryError.isInstance(error)) {
    candidates.push(...error.errors);
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined) {
    candidates.push(cause);
  }
  return candidates;
}
function considerAdvice(
  current: number | undefined,
  value: number | undefined,
): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return current;
  }
  return current === undefined ? value : Math.max(current, value);
}
function resetAdviceMs(raw: string | undefined, nowMs: number): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const resetAtMs = value < EPOCH_MS_THRESHOLD ? value * SECONDS_TO_MS : value;
  return Math.max(0, resetAtMs - nowMs);
}
function headerAdviceOf(headers: RetryAfterHeaders, nowMs: number): number | undefined {
  let best: number | undefined;
  const msRaw = headers['retry-after-ms'];
  if (msRaw !== undefined) {
    const ms = Number.parseFloat(msRaw);
    best = considerAdvice(best, Number.isFinite(ms) ? ms : undefined);
  }
  const secondsRaw = headers['retry-after'];
  if (secondsRaw !== undefined) {
    const seconds = Number.parseFloat(secondsRaw);
    if (Number.isFinite(seconds)) {
      best = considerAdvice(best, seconds * SECONDS_TO_MS);
    } else {
      const dateMs = Date.parse(secondsRaw);
      if (Number.isFinite(dateMs)) {
        best = considerAdvice(best, Math.max(0, dateMs - nowMs));
      }
    }
  }
  return considerAdvice(best, resetAdviceMs(headers['x-ratelimit-reset'], nowMs));
}
function retryAfterMsOf(error: unknown): number | undefined {
  const nowMs = Date.now();
  let best: number | undefined;
  for (const candidate of adviceCandidates(error)) {
    if (!APICallError.isInstance(candidate)) {
      continue;
    }
    const headers = candidate.responseHeaders as RetryAfterHeaders | undefined;
    if (headers === undefined) {
      continue;
    }
    best = considerAdvice(best, headerAdviceOf(headers, nowMs));
  }
  return best;
}
export interface RetryPlan {
  schedule: number[];
  waitMs: number;
  replay: boolean;
}
function jittered(ms: number): number {
  const delta = ms * RETRY_JITTER_RATIO;
  return Math.max(RETRY_FLOOR_MS, Math.round(ms + (Math.random() * 2 - 1) * delta));
}
export interface RetryPlanOptions {
  /** A clean replay was already used in this call. */
  alreadyReplayed?: boolean;
  /** Cap of retry attempts (default: the full schedule). */
  attemptLimit?: number;
}
export function retryPlan(
  error: unknown,
  emitted: boolean,
  signal: AbortSignal | undefined,
  attempt: number,
  options: RetryPlanOptions = {},
): RetryPlan | undefined {
  const rateLimited = isRateLimitError(error);
  if (!rateLimited && !isTransientProviderError(error)) {
    return undefined;
  }
  const schedule = rateLimited ? RATE_LIMIT_RETRY_DELAYS_MS : SERVER_ERROR_RETRY_DELAYS_MS;
  const cap =
    typeof options.attemptLimit === 'number' &&
    Number.isFinite(options.attemptLimit) &&
    options.attemptLimit >= 1
      ? Math.min(Math.floor(options.attemptLimit), schedule.length)
      : schedule.length;
  if (signal?.aborted || attempt >= cap) {
    return undefined;
  }
  if (emitted && options.alreadyReplayed) {
    return undefined;
  }
  const replay = emitted;
  const advised = retryAfterMsOf(error);
  const waitMs =
    advised !== undefined
      ? Math.min(Math.max(0, advised), RETRY_AFTER_MAX_MS)
      : jittered(
          schedule[attempt] ?? (rateLimited ? RATE_LIMIT_FALLBACK_MS : SERVER_ERROR_FALLBACK_MS),
        );
  return { schedule, waitMs, replay };
}
export function retryChunk(error: unknown, attempt: number, plan: RetryPlan): StreamChunk {
  const maxRetries = plan.schedule.length;
  return {
    type: 'retry',
    attempt: attempt + 1,
    maxRetries,
    delayMs: plan.waitMs,
    message: retryMessage(error, attempt + 1, maxRetries, plan.waitMs),
  };
}
export function abortableSleep(waitMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) {
    return new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, waitMs);
    signal.addEventListener('abort', done, { once: true });
  });
}
export function driverErrorStatus(error: unknown): number | undefined {
  const candidates: unknown[] = [error];
  if (RetryError.isInstance(error)) {
    candidates.push(...error.errors);
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined) {
    candidates.push(cause);
  }
  for (const candidate of candidates) {
    if (APICallError.isInstance(candidate) && typeof candidate.statusCode === 'number') {
      return candidate.statusCode;
    }
  }
  for (const candidate of candidates) {
    const status = (candidate as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && Number.isFinite(status)) {
      return status;
    }
  }
  return undefined;
}
