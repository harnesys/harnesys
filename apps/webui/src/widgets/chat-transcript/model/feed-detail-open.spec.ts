import { describe, expect, test } from 'bun:test';
import { isAutoOpen } from './feed-detail-open';

describe('isAutoOpen', () => {
  test('manual never opens a block on its own', () => {
    expect(isAutoOpen('manual', true)).toBe(false);
    expect(isAutoOpen('manual', false)).toBe(false);
  });

  test('quiet follows the live block only', () => {
    expect(isAutoOpen('quiet', true)).toBe(true);
    expect(isAutoOpen('quiet', false)).toBe(false);
  });

  test('full keeps every block open', () => {
    expect(isAutoOpen('full', true)).toBe(true);
    expect(isAutoOpen('full', false)).toBe(true);
  });
});
