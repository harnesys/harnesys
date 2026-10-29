import { describe, expect, test } from 'bun:test';
import { isValidCron, nextCronRunAt } from './cron-next.ts';

const FROM = new Date('2026-10-22T00:00:00.000Z');

describe('nextCronRunAt', () => {
  test('fires at 09:00 of the org timezone', () => {
    expect(nextCronRunAt('0 9 * * *', FROM, 'Europe/Moscow')).toBe('2026-10-22T06:00:00.000Z');
  });

  test('fires at 09:00 UTC when the org timezone is UTC', () => {
    expect(nextCronRunAt('0 9 * * *', FROM, 'UTC')).toBe('2026-10-22T09:00:00.000Z');
  });

  test('falls back to UTC for an unknown timezone', () => {
    expect(nextCronRunAt('0 9 * * *', FROM, 'Not/AZone')).toBe('2026-10-22T09:00:00.000Z');
  });

  test('skips the current occurrence when it is already due', () => {
    expect(nextCronRunAt('0 9 * * *', new Date('2026-10-22T07:00:00.000Z'), 'Europe/Moscow')).toBe(
      '2026-10-23T06:00:00.000Z',
    );
  });

  test('throws when the expression has no next run', () => {
    expect(() => nextCronRunAt('0 0 30 2 *', FROM, 'UTC')).toThrow();
  });
});

describe('isValidCron', () => {
  test('accepts a valid expression in the org timezone', () => {
    expect(isValidCron('0 9 * * *', 'Europe/Moscow')).toBe(true);
  });

  test('rejects a broken expression', () => {
    expect(isValidCron('not-a-cron', 'Europe/Moscow')).toBe(false);
  });

  test('rejects a broken expression with an unknown timezone', () => {
    expect(isValidCron('not-a-cron', 'Not/AZone')).toBe(false);
  });
});
