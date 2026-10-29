import { describe, expect, test } from 'bun:test';
import {
  browserLocalDateFromDayKey,
  browserLocalDayKey,
  dayKeyInTimeZone,
  isDateOnlyValue,
  isValidTimeZone,
  startOfDayInTimeZone,
  timeZoneOptions,
  zoneOffsetMinutes,
} from './time-zone';

describe('timeZoneOptions', () => {
  test('always contains UTC and returns a sorted unique list', () => {
    const options = timeZoneOptions();
    expect(options).toContain('UTC');
    expect(new Set(options).size).toBe(options.length);
    expect([...options].sort()).toEqual(options);
  });
});

describe('isValidTimeZone', () => {
  test('known zones pass, unknown ones fail', () => {
    expect(isValidTimeZone('Europe/Moscow')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('zoneOffsetMinutes', () => {
  test('reads the offset of the zone at the given instant', () => {
    const winter = new Date('2024-01-15T12:00:00.000Z');
    expect(zoneOffsetMinutes('UTC', winter)).toBe(0);
    expect(zoneOffsetMinutes('Europe/Moscow', winter)).toBe(180);
    expect(zoneOffsetMinutes('Asia/Tokyo', winter)).toBe(540);
  });
});

describe('startOfDayInTimeZone', () => {
  test('UTC starts at midnight UTC', () => {
    expect(startOfDayInTimeZone('UTC', new Date('2024-03-10T15:42:00.000Z'))).toBe(
      '2024-03-10T00:00:00.000Z',
    );
  });

  test('a positive offset moves the day boundary back', () => {
    expect(startOfDayInTimeZone('Europe/Moscow', new Date('2024-03-10T15:42:00.000Z'))).toBe(
      '2024-03-09T21:00:00.000Z',
    );
  });

  test('the boundary is the local midnight of the previous day for negative offsets', () => {
    expect(startOfDayInTimeZone('America/New_York', new Date('2024-03-10T15:42:00.000Z'))).toBe(
      '2024-03-10T05:00:00.000Z',
    );
  });
});

describe('dayKeyInTimeZone', () => {
  test('reads the calendar day of the zone', () => {
    expect(dayKeyInTimeZone('UTC', new Date('2024-03-10T23:30:00.000Z'))).toBe('2024-03-10');
    expect(dayKeyInTimeZone('Europe/Moscow', new Date('2024-03-10T23:30:00.000Z'))).toBe(
      '2024-03-11',
    );
    expect(dayKeyInTimeZone('America/New_York', new Date('2024-03-10T02:30:00.000Z'))).toBe(
      '2024-03-09',
    );
  });
});

describe('isDateOnlyValue', () => {
  test('accepts plain calendar days only', () => {
    expect(isDateOnlyValue('2024-03-10')).toBe(true);
    expect(isDateOnlyValue('2024-03-10T00:00:00.000Z')).toBe(false);
    expect(isDateOnlyValue('nope')).toBe(false);
  });
});

describe('browser local day helpers', () => {
  test('a day key becomes a local calendar date', () => {
    const date = browserLocalDateFromDayKey('2024-03-10');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(10);
  });

  test('a broken day key has no date', () => {
    expect(browserLocalDateFromDayKey('nope')).toBeNull();
  });

  test('a local date becomes a day key', () => {
    const date = new Date(2024, 2, 10);
    expect(browserLocalDayKey(date)).toBe('2024-03-10');
  });
});
