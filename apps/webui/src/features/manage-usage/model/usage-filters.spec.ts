import { describe, expect, test } from 'bun:test';
import { usageRangeFromPreset } from './usage-filters';

const NOW = new Date('2026-03-10T15:42:00.000Z');

describe('usageRangeFromPreset', () => {
  test('the last day is a rolling 24 hour window', () => {
    expect(usageRangeFromPreset(1, 'UTC', NOW)).toEqual({
      from: '2026-03-09T15:42:00.000Z',
      to: '2026-03-10T15:42:00.000Z',
    });
  });

  test('longer presets start on the organization day boundary', () => {
    expect(usageRangeFromPreset(7, 'UTC', NOW)).toEqual({
      from: '2026-03-04T00:00:00.000Z',
      to: '2026-03-10T15:42:00.000Z',
    });
  });

  test('the day boundary follows the organization zone', () => {
    expect(usageRangeFromPreset(7, 'Europe/Moscow', NOW)).toEqual({
      from: '2026-03-03T21:00:00.000Z',
      to: '2026-03-10T15:42:00.000Z',
    });
  });
});
