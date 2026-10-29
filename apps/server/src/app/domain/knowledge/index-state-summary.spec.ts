import { describe, expect, test } from 'bun:test';
import { sourceIndexStateOf } from './index-state-summary.ts';

describe('sourceIndexStateOf', () => {
  test('maps all index state combinations', () => {
    expect(
      sourceIndexStateOf({
        entireSource: false,
        indexed: 0,
        pending: 3,
        total: 3,
        running: false,
      }),
    ).toBe('not-indexed');
    expect(
      sourceIndexStateOf({
        entireSource: true,
        indexed: 0,
        pending: 2,
        total: 2,
        running: true,
      }),
    ).toBe('not-indexed');
    expect(
      sourceIndexStateOf({
        entireSource: true,
        indexed: 0,
        pending: 0,
        total: 0,
        running: false,
      }),
    ).toBe('not-indexed');
    expect(
      sourceIndexStateOf({
        entireSource: false,
        indexed: 4,
        pending: 1,
        total: 5,
        running: false,
      }),
    ).toBe('selected-paths');
    expect(
      sourceIndexStateOf({
        entireSource: true,
        indexed: 4,
        pending: 1,
        total: 5,
        running: true,
      }),
    ).toBe('selected-paths');
    expect(
      sourceIndexStateOf({
        entireSource: true,
        indexed: 5,
        pending: 0,
        total: 5,
        running: false,
      }),
    ).toBe('entire-source');
  });
});
