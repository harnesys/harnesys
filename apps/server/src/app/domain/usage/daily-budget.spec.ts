import { describe, expect, test } from 'bun:test';
import {
  dailyBudgetExceeded,
  localDayRange,
  normalizeTimeZone,
  offsetModifierOf,
  zoneOffsetMinutes,
} from './daily-budget.ts';

describe('dailyBudgetExceeded', () => {
  test('no budget never blocks', () => {
    expect(dailyBudgetExceeded(null, 100)).toBe(false);
    expect(dailyBudgetExceeded(0, 100)).toBe(false);
  });

  test('spend below the limit does not block', () => {
    expect(dailyBudgetExceeded(5, 4.99)).toBe(false);
  });

  test('spend at or above the limit blocks', () => {
    expect(dailyBudgetExceeded(5, 5)).toBe(true);
    expect(dailyBudgetExceeded(5, 5.01)).toBe(true);
  });
});

describe('normalizeTimeZone', () => {
  test('keeps a known zone', () => {
    expect(normalizeTimeZone('Europe/Moscow')).toBe('Europe/Moscow');
    expect(normalizeTimeZone('UTC')).toBe('UTC');
  });

  test('falls back to UTC for unknown or missing zones', () => {
    expect(normalizeTimeZone('Mars/Olympus')).toBe('UTC');
    expect(normalizeTimeZone(undefined)).toBe('UTC');
    expect(normalizeTimeZone(null)).toBe('UTC');
    expect(normalizeTimeZone('')).toBe('UTC');
  });
});

describe('zoneOffsetMinutes', () => {
  test('reports whole-hour and half-hour offsets', () => {
    expect(zoneOffsetMinutes('UTC', new Date('2026-10-21T12:00:00.000Z'))).toBe(0);
    expect(zoneOffsetMinutes('Europe/Moscow', new Date('2026-10-21T12:00:00.000Z'))).toBe(180);
    expect(zoneOffsetMinutes('Asia/Kolkata', new Date('2026-10-21T12:00:00.000Z'))).toBe(330);
  });

  test('follows daylight saving time', () => {
    expect(zoneOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00.000Z'))).toBe(-300);
    expect(zoneOffsetMinutes('America/New_York', new Date('2026-07-15T12:00:00.000Z'))).toBe(-240);
  });
});

describe('offsetModifierOf', () => {
  test('formats an sqlite-compatible offset modifier', () => {
    expect(offsetModifierOf(0)).toBe('+00:00');
    expect(offsetModifierOf(180)).toBe('+03:00');
    expect(offsetModifierOf(-300)).toBe('-05:00');
    expect(offsetModifierOf(330)).toBe('+05:30');
  });
});

describe('localDayRange', () => {
  test('UTC gives the plain calendar UTC day', () => {
    const range = localDayRange('UTC', new Date('2026-10-21T23:30:00.000Z'));
    expect(range.day).toBe('2026-10-21');
    expect(range.startIso).toBe('2026-10-21T00:00:00.000Z');
    expect(range.endIso).toBe('2026-10-22T00:00:00.000Z');
  });

  test('Moscow shifts the day boundary by three hours', () => {
    const range = localDayRange('Europe/Moscow', new Date('2026-10-21T23:30:00.000Z'));
    expect(range.day).toBe('2026-10-22');
    expect(range.startIso).toBe('2026-10-21T21:00:00.000Z');
    expect(range.endIso).toBe('2026-10-22T21:00:00.000Z');
    expect(range.offsetMinutes).toBe(180);
  });

  test('New York in winter uses the standard offset', () => {
    const range = localDayRange('America/New_York', new Date('2026-01-15T03:00:00.000Z'));
    expect(range.day).toBe('2026-01-14');
    expect(range.startIso).toBe('2026-01-14T05:00:00.000Z');
    expect(range.endIso).toBe('2026-01-15T05:00:00.000Z');
    expect(range.offsetMinutes).toBe(-300);
  });

  test('New York in summer uses the daylight offset', () => {
    const range = localDayRange('America/New_York', new Date('2026-07-15T03:00:00.000Z'));
    expect(range.day).toBe('2026-07-14');
    expect(range.startIso).toBe('2026-07-14T04:00:00.000Z');
    expect(range.endIso).toBe('2026-07-15T04:00:00.000Z');
    expect(range.offsetMinutes).toBe(-240);
  });

  test('spring forward day is 23 hours long', () => {
    const range = localDayRange('America/New_York', new Date('2026-03-08T18:00:00.000Z'));
    expect(range.day).toBe('2026-03-08');
    expect(range.startIso).toBe('2026-03-08T05:00:00.000Z');
    expect(range.endIso).toBe('2026-03-09T04:00:00.000Z');
  });

  test('fall back day is 25 hours long', () => {
    const range = localDayRange('America/New_York', new Date('2026-11-01T18:00:00.000Z'));
    expect(range.day).toBe('2026-11-01');
    expect(range.startIso).toBe('2026-11-01T04:00:00.000Z');
    expect(range.endIso).toBe('2026-11-02T05:00:00.000Z');
  });

  test('half-hour zone keeps its local midnight', () => {
    const range = localDayRange('Asia/Kolkata', new Date('2026-10-21T20:00:00.000Z'));
    expect(range.day).toBe('2026-10-22');
    expect(range.startIso).toBe('2026-10-21T18:30:00.000Z');
    expect(range.endIso).toBe('2026-10-22T18:30:00.000Z');
  });

  test('an unknown zone falls back to the UTC calendar day', () => {
    const range = localDayRange('Mars/Olympus', new Date('2026-10-21T23:30:00.000Z'));
    expect(range.day).toBe('2026-10-21');
    expect(range.startIso).toBe('2026-10-21T00:00:00.000Z');
    expect(range.endIso).toBe('2026-10-22T00:00:00.000Z');
  });
});
