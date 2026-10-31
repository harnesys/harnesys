import { APICallError, RetryError } from 'ai';
import {
  isRateLimitError,
  isTransientProviderError,
  retryMessage,
} from '../application/provider-error.ts';
import type { StreamChunk } from './ai-llm-chunks.ts';

const RATE_LIMIT_RETRY_DELAYS_MS = [10_000, 20_000, 40_000, 80_000, 160_000, 300_000];
const SERVER_ERROR_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 32_000, 60_000];
const RETRY_AFTER_MAX_MS = 600_000;
const RETRY_JITTER_RATIO = 0.2;
interface RetryAfterHeaders {
  'retry-after'?: string;
  'retry-after-ms'?: string;
}
function retryAfterMsOf(error: unknown): number | undefined {
  const candidates: unknown[] = [error];
  if (RetryError.isInstance(error)) {
    candidates.push(...error.errors);
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined) {
    candidates.push(cause);
  }
  for (const candidate of candidates) {
    if (!APICallError.isInstance(candidate)) {
      continue;
    }
    const headers = candidate.responseHeaders as RetryAfterHeaders | undefined;
    const msRaw = headers?.['retry-after-ms'];
    const ms = msRaw === undefined ? undefined : Number.parseFloat(msRaw);
    if (ms !== undefined && Number.isFinite(ms)) {
      return ms;
    }
    const secondsRaw = headers?.['retry-after'];
    const seconds = secondsRaw === undefined ? undefined : Number.parseFloat(secondsRaw);
    if (seconds !== undefined && Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }
  return undefined;
}
export interface RetryPlan {
  schedule: number[];
  waitMs: number;
  replay: boolean;
}
function jittered(ms: number): number {
  const delta = ms * RETRY_JITTER_RATIO;
  return Math.max(1_000, Math.round(ms + (Math.random() * 2 - 1) * delta));
}
export function retryPlan(
  error: unknown,
  emitted: boolean,
  signal: AbortSignal | undefined,
  attempt: number,
  alreadyReplayed = false,
): RetryPlan | undefined {
  const rateLimited = isRateLimitError(error);
  if (!rateLimited && !isTransientProviderError(error)) {
    return undefined;
  }
  const schedule = rateLimited ? RATE_LIMIT_RETRY_DELAYS_MS : SERVER_ERROR_RETRY_DELAYS_MS;
  if (signal?.aborted || attempt >= schedule.length) {
    return undefined;
  }
  if (emitted && alreadyReplayed) {
    return undefined;
  }
  const replay = emitted;
  const advised = retryAfterMsOf(error);
  const waitMs =
    advised !== undefined
      ? Math.min(advised, RETRY_AFTER_MAX_MS)
      : jittered(schedule[attempt] ?? (rateLimited ? 10_000 : 2_000));
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
