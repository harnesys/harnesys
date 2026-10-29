import { describe, expect, test } from 'bun:test';
import { calendarEventsQuery } from './calendar-api.ts';

function paramsOf(query: URLSearchParams): Record<string, string> {
  return Object.fromEntries(query);
}

describe('calendarEventsQuery', () => {
  test('defaults to singleEvents with startTime order and maxResults 25', () => {
    expect(paramsOf(calendarEventsQuery({}))).toEqual({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '25',
    });
  });

  test('passes time bounds and maps query to q', () => {
    const params = paramsOf(
      calendarEventsQuery({
        timeMin: '2026-10-01T00:00:00Z',
        timeMax: '2026-11-01T00:00:00Z',
        query: 'standup & review',
      }),
    );
    expect(params.timeMin).toBe('2026-10-01T00:00:00Z');
    expect(params.timeMax).toBe('2026-11-01T00:00:00Z');
    expect(params.q).toBe('standup & review');
  });

  test('clamps maxResults into the 1..50 range', () => {
    expect(paramsOf(calendarEventsQuery({ maxResults: 0 })).maxResults).toBe('1');
    expect(paramsOf(calendarEventsQuery({ maxResults: 100 })).maxResults).toBe('50');
    expect(paramsOf(calendarEventsQuery({ maxResults: 5 })).maxResults).toBe('5');
  });
});
