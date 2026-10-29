import { APICallError, RetryError } from 'ai';
import {
  isRateLimitError,
  isTransientProviderError,
  retryMessage,
} from '../application/provider-error.ts';
import type { StreamChunk } from './ai-llm-chunks.ts';

const RATE_LIMIT_RETRY_DELAYS_MS = [10_000, 30_000, 60_000];
const SERVER_ERROR_RETRY_DELAYS_MS = [3_000, 8_000, 20_000];
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
}
export function retryPlan(
  error: unknown,
  emitted: boolean,
  signal: AbortSignal | undefined,
  attempt: number,
): RetryPlan | undefined {
  const rateLimited = isRateLimitError(error);
  if (!rateLimited && !isTransientProviderError(error)) {
    return undefined;
  }
  const schedule = rateLimited ? RATE_LIMIT_RETRY_DELAYS_MS : SERVER_ERROR_RETRY_DELAYS_MS;
  if (emitted || signal?.aborted || attempt >= schedule.length) {
    return undefined;
  }
  const waitMs = retryAfterMsOf(error) ?? schedule[attempt] ?? (rateLimited ? 10_000 : 3_000);
  return { schedule, waitMs };
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
  return undefined;
}
