import { describe, expect, test } from 'bun:test';
import { tryAcquireLease } from './lease.ts';

describe('tryAcquireLease', () => {
  test('hold for null owner, self, or expired other; busy for live other', () => {
    const now = 1_000_000;
    expect(tryAcquireLease({ owner: null, until: null, me: 'host-a', now })).toBe('hold');
    expect(
      tryAcquireLease({
        owner: 'host-a',
        until: new Date(now + 10_000).toISOString(),
        me: 'host-a',
        now,
      }),
    ).toBe('hold');
    expect(
      tryAcquireLease({
        owner: 'host-b',
        until: new Date(now - 1).toISOString(),
        me: 'host-a',
        now,
      }),
    ).toBe('hold');
    expect(
      tryAcquireLease({
        owner: 'host-b',
        until: new Date(now + 10_000).toISOString(),
        me: 'host-a',
        now,
      }),
    ).toBe('busy');
  });
});
