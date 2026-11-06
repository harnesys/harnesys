import { describe, expect, test } from 'bun:test';
import { isRuleOverCap, isRuleThrottled, type RuleRecord, runsDate } from './records.ts';

const base: RuleRecord = {
  id: 'r1',
  name: 'Rule',
  status: 'active',
  agentId: 'a1',
  threadId: 't1',
  modeId: 'default',
  detail: '',
  filter: [],
  history: 'none',
  historyLast: 20,
  maxRunsPerDay: 3,
  throttleSec: 60,
  runsDate: '2026-11-06',
  runsToday: 3,
  lastFiredAt: '2026-11-06T10:00:00.000Z',
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
};

describe('rule limits', () => {
  test('runs date is the iso day', () => {
    expect(runsDate('2026-11-06T23:59:00.000Z')).toBe('2026-11-06');
  });

  test('daily cap blocks the same day only', () => {
    expect(isRuleOverCap(base, '2026-11-06T12:00:00.000Z')).toBe(true);
    expect(isRuleOverCap(base, '2026-11-07T00:10:00.000Z')).toBe(false);
  });

  test('throttle blocks inside the gap and passes after it', () => {
    expect(isRuleThrottled(base, '2026-11-06T10:00:30.000Z')).toBe(true);
    expect(isRuleThrottled(base, '2026-11-06T10:01:00.000Z')).toBe(false);
  });

  test('zero gap never throttles', () => {
    expect(isRuleThrottled({ ...base, throttleSec: 0 }, '2026-11-06T10:00:01.000Z')).toBe(false);
  });
});
