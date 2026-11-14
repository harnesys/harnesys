import { describe, expect, test } from 'bun:test';
import { ProviderError, providerRetryAfterSec } from './errors.ts';

describe('ProviderError', () => {
  test('single-arg construction keeps meta absent', () => {
    const error = new ProviderError('rate_limited');
    expect(error.code).toBe('rate_limited');
    expect(error.meta).toBeUndefined();
    expect(providerRetryAfterSec(error)).toBeNull();
  });

  test('meta retryAfterSec is carried through', () => {
    const error = new ProviderError('rate_limited', { retryAfterSec: 30 });
    expect(error.meta?.retryAfterSec).toBe(30);
    expect(providerRetryAfterSec(error)).toBe(30);
  });

  test('retryAfterSec must be a nonneg integer', () => {
    expect(providerRetryAfterSec(new ProviderError('rate_limited', { retryAfterSec: 0 }))).toBe(0);
    expect(
      providerRetryAfterSec(new ProviderError('rate_limited', { retryAfterSec: 1.5 })),
    ).toBeNull();
    expect(
      providerRetryAfterSec(new ProviderError('rate_limited', { retryAfterSec: -5 })),
    ).toBeNull();
    expect(
      providerRetryAfterSec(new ProviderError('rate_limited', { retryAfterSec: Number.NaN })),
    ).toBeNull();
  });
});
