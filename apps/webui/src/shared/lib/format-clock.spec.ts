import { describe, expect, test } from 'bun:test';
import {
  formatClock,
  formatClockSeconds,
  formatDateTime,
  formatDayKey,
  formatDayTime,
  formatFullDate,
  formatShortDate,
} from './format-clock';

const INSTANT = '2026-03-10T15:42:00.000Z';

describe('formatClock', () => {
  test('renders the instant in the requested zone', () => {
    expect(formatClock(INSTANT, 'UTC')).toBe('03:42 PM');
    expect(formatClock(INSTANT, 'Europe/Moscow')).toBe('06:42 PM');
    expect(formatClock(INSTANT, 'America/New_York')).toBe('11:42 AM');
  });

  test('keeps the browser zone out of the result', () => {
    expect(formatClockSeconds(INSTANT, 'UTC')).toBe('03:42:00 PM');
  });

  test('returns the raw value for broken input', () => {
    expect(formatClock('not-a-date', 'UTC')).toBe('not-a-date');
  });
});

describe('formatDayTime', () => {
  test('combines the day and the time of the requested zone', () => {
    expect(formatDayTime(INSTANT, 'UTC')).toBe('Mar 10 at 03:42 PM');
  });
});

describe('date formatters', () => {
  test('shift plain instants into the requested zone', () => {
    expect(formatShortDate('2026-03-10T02:00:00.000Z', 'America/New_York')).toBe('Mar 9');
    expect(formatShortDate('2026-03-10T02:00:00.000Z', 'Europe/Moscow')).toBe('Mar 10');
  });

  test('keep date-only values on the same calendar day', () => {
    expect(formatShortDate('2026-03-10', 'America/New_York')).toBe('Mar 10');
    expect(formatShortDate('2026-03-10', 'Asia/Tokyo')).toBe('Mar 10');
    expect(formatFullDate('2026-03-10', 'America/New_York')).toBe('Mar 10, 2026');
  });

  test('format the date and the time of an instant', () => {
    expect(formatDateTime(INSTANT, 'Europe/Moscow')).toBe('Mar 10 at 6:42 PM');
  });
});

describe('formatDayKey', () => {
  test('renders an org-local day key without shifting it', () => {
    expect(formatDayKey('2026-03-10')).toBe('Mar 10');
  });

  test('returns the raw key for broken input', () => {
    expect(formatDayKey('nope')).toBe('nope');
  });
});
