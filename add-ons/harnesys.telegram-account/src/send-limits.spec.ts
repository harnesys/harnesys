import { describe, expect, test } from 'bun:test';
import { checkSendWindow, DEFAULT_SEND_LIMITS, sendLimitsOf } from './send-limits.ts';

const NOW = new Date('2026-01-01T12:00:00.000Z');

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function secondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe('send limits', () => {
  test('parses config values over the documented defaults', () => {
    expect(sendLimitsOf({})).toEqual(DEFAULT_SEND_LIMITS);
    expect(
      sendLimitsOf({
        min_send_interval_ms: '500',
        max_sends_per_hour: 5,
        max_sends_per_day: 40,
        flood_wait_retries: 9,
      }),
    ).toEqual({ minIntervalMs: 500, maxPerHour: 5, maxPerDay: 40, floodWaitRetries: 3 });
  });

  test('blocks a second send to the same chat inside the interval but not to another chat', () => {
    const sameChat = checkSendWindow(DEFAULT_SEND_LIMITS, {
      recent: [secondsAgo(1)],
      chatRecent: [secondsAgo(1)],
      now: NOW,
    });
    expect(sameChat.allowed).toBe(false);
    expect(sameChat.reason).toBe('interval');
    expect(sameChat.retryAfterSec).toBe(1);
    expect(
      checkSendWindow(DEFAULT_SEND_LIMITS, { recent: [secondsAgo(1)], chatRecent: [], now: NOW })
        .allowed,
    ).toBe(true);
  });

  test('blocks at the hourly and daily caps with the wait until the oldest send expires', () => {
    const hourly = checkSendWindow(
      { ...DEFAULT_SEND_LIMITS, minIntervalMs: 0, maxPerHour: 2, maxPerDay: 100 },
      { recent: [minutesAgo(1), minutesAgo(30)], chatRecent: [], now: NOW },
    );
    expect(hourly.allowed).toBe(false);
    expect(hourly.reason).toBe('hour');
    expect(hourly.retryAfterSec).toBe(30 * 60);

    const daily = checkSendWindow(
      { ...DEFAULT_SEND_LIMITS, minIntervalMs: 0, maxPerHour: 100, maxPerDay: 2 },
      { recent: [minutesAgo(60), minutesAgo(120)], chatRecent: [], now: NOW },
    );
    expect(daily.allowed).toBe(false);
    expect(daily.reason).toBe('day');
    expect(daily.retryAfterSec).toBe(22 * 60 * 60);
  });
});
