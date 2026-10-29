import { describe, expect, test } from 'bun:test';
import { APICallError, RetryError } from 'ai';
import {
  finalProviderMessage,
  isProviderError,
  isRateLimitError,
  isTransientProviderError,
  providerErrorCode,
  retryMessage,
} from './provider-error.ts';

const BODY = JSON.stringify({
  error: {
    message: 'Provider returned error',
    code: 429,
    metadata: {
      raw: 'poolside/laguna-s-2.1:free is temporarily rate-limited upstream.',
      provider_name: 'Poolside',
    },
  },
});

const SERVER_BODY = JSON.stringify({
  error: {
    message: 'Provider returned error',
    code: 502,
    metadata: {
      raw: 'poolside/laguna-s-2.1:free is temporarily unavailable upstream.',
      provider_name: 'Poolside',
    },
  },
});

function apiErrorWithStatus(statusCode: number, responseBody: string): APICallError {
  return new APICallError({
    message: 'Provider returned error',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    requestBodyValues: {},
    statusCode,
    responseHeaders: {},
    responseBody,
    isRetryable: true,
  });
}

function apiError(): APICallError {
  return apiErrorWithStatus(429, BODY);
}

function serverError(): APICallError {
  return apiErrorWithStatus(502, SERVER_BODY);
}

function retryError(): RetryError {
  const last = apiError();
  return new RetryError({
    message: 'Failed after 3 attempts. Last error: Provider returned error',
    reason: 'maxRetriesExceeded',
    errors: [apiError(), apiError(), last],
  });
}

describe('provider-error', () => {
  test('detects rate limit through RetryError wrapper', () => {
    expect(isRateLimitError(retryError())).toBe(true);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
  });

  test('retry message shows attempt and provider', () => {
    const text = retryMessage(retryError(), 1, 3, 10_000);
    expect(text).toContain('Rate limited');
    expect(text).toContain('1/3');
    expect(text).toContain('429');
    expect(text).toContain('Poolside');
    expect(text).toContain('10s');
    expect(text.length).toBeLessThan(400);
  });

  test('detects transient 5xx provider errors', () => {
    expect(isTransientProviderError(serverError())).toBe(true);
    expect(isTransientProviderError(apiError())).toBe(true);
    expect(isTransientProviderError(apiErrorWithStatus(400, BODY))).toBe(false);
    expect(isTransientProviderError(new Error('boom'))).toBe(false);
  });

  test('retry message for 5xx reports provider unavailable', () => {
    const text = retryMessage(serverError(), 1, 3, 8_000);
    expect(text).toContain('Provider unavailable');
    expect(text).not.toContain('Rate limited');
    expect(text).toContain('1/3');
    expect(text).toContain('8s');
  });

  test('final message is short and keeps provider hint', () => {
    const text = finalProviderMessage(retryError());
    expect(text).toContain('429');
    expect(text).toContain('Poolside');
    expect(text.length).toBeLessThan(500);
    expect(text).not.toContain('vercel.ai.error');
  });

  test('codes and provider detection', () => {
    expect(providerErrorCode(retryError())).toBe('provider_rate_limited');
    expect(isProviderError(retryError())).toBe(true);
    expect(isProviderError(new Error('plain'))).toBe(false);
    expect(providerErrorCode(new Error('plain'))).toBe('run_failed');
  });
});
