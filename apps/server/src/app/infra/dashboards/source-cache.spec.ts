import { describe, expect, test } from 'bun:test';
import { TtlCache } from './source-cache.ts';

describe('TtlCache', () => {
  test('returns cached value before expiry and reports nothing after', () => {
    let nowMs = 1_000;
    const cache = new TtlCache<string>(() => nowMs);
    cache.set('k', 'v', 30);
    expect(cache.get('k')).toBe('v');
    nowMs += 29_999;
    expect(cache.get('k')).toBe('v');
    nowMs += 2;
    expect(cache.get('k')).toBeUndefined();
  });

  test('ttl of zero or negative never stores', () => {
    const cache = new TtlCache<string>(() => 0);
    cache.set('k', 'v', 0);
    cache.set('k2', 'v', -1);
    expect(cache.get('k')).toBeUndefined();
    expect(cache.get('k2')).toBeUndefined();
  });

  test('later set with same key replaces value and expiry', () => {
    let nowMs = 0;
    const cache = new TtlCache<number>(() => nowMs);
    cache.set('k', 1, 30);
    nowMs = 1_000;
    cache.set('k', 2, 60);
    nowMs = 30_000;
    expect(cache.get('k')).toBe(2);
    nowMs = 61_000;
    expect(cache.get('k')).toBeUndefined();
  });

  test('each key expires independently', () => {
    let nowMs = 0;
    const cache = new TtlCache<string>(() => nowMs);
    cache.set('short', 'a', 30);
    cache.set('long', 'b', 3600);
    nowMs = 31_000;
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe('b');
  });
});
