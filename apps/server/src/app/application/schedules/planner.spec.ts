import { describe, expect, test } from 'bun:test';
import { decideDue, planDueBatch, scheduleFireId } from '../../domain/schedule/planner.ts';

interface BatchRow {
  id: string;
  dueAt: Date;
  online: boolean;
}

function row(id: string, dueAt: string, online: boolean): BatchRow {
  return { id, dueAt: new Date(dueAt), online };
}

describe('decideDue', () => {
  test('due inside window with online node fires with deterministic fireId', () => {
    const nextDueAt = new Date('2030-01-01T00:30:00.000Z');
    const decision = decideDue({
      now: new Date('2030-01-01T01:00:00.000Z'),
      nextDueAt,
      catchupWindowSec: 3600,
      nodeOnline: true,
      scheduleId: 'sched-1',
    });
    expect(decision.action).toBe('fire');
    expect(decision.fireId).toBe(scheduleFireId('sched-1', nextDueAt));
  });

  test('due older than window misses as stale', () => {
    const decision = decideDue({
      now: new Date('2030-01-01T02:00:00.000Z'),
      nextDueAt: new Date('2030-01-01T00:00:00.000Z'),
      catchupWindowSec: 3600,
      nodeOnline: true,
    });
    expect(decision.action).toBe('miss_stale');
    expect(decision.fireId).toBeUndefined();
  });

  test('catch-up offline inside window still fires into placement queue', () => {
    const nextDueAt = new Date('2030-01-01T00:30:00.000Z');
    const decision = decideDue({
      now: new Date('2030-01-01T01:00:00.000Z'),
      nextDueAt,
      catchupWindowSec: 3600,
      nodeOnline: false,
      missPolicy: 'catch-up',
      scheduleId: 'sched-1',
    });
    expect(decision.action).toBe('fire');
    expect(decision.fireId).toBe(scheduleFireId('sched-1', nextDueAt));
  });

  test('skip offline at due misses offline', () => {
    const decision = decideDue({
      now: new Date('2030-01-01T01:00:00.000Z'),
      nextDueAt: new Date('2030-01-01T01:00:00.000Z'),
      catchupWindowSec: 3600,
      nodeOnline: false,
      missPolicy: 'skip',
    });
    expect(decision.action).toBe('miss_offline');
  });

  test('future due waits', () => {
    const decision = decideDue({
      now: new Date('2030-01-01T00:00:00.000Z'),
      nextDueAt: new Date('2030-01-01T01:00:00.000Z'),
      catchupWindowSec: 3600,
      nodeOnline: true,
    });
    expect(decision.action).toBe('wait');
  });

  test('boundary of window still fires', () => {
    const decision = decideDue({
      now: new Date('2030-01-01T01:00:00.000Z'),
      nextDueAt: new Date('2030-01-01T00:00:00.000Z'),
      catchupWindowSec: 3600,
      nodeOnline: true,
      scheduleId: 'sched-1',
    });
    expect(decision.action).toBe('fire');
  });

  test('missPolicy skip treats overdue as miss_stale without fire', () => {
    const decision = decideDue({
      now: new Date('2030-01-01T01:00:00.000Z'),
      nextDueAt: new Date('2030-01-01T00:30:00.000Z'),
      catchupWindowSec: 3600,
      nodeOnline: true,
      missPolicy: 'skip',
    });
    expect(decision.action).toBe('miss_stale');
    expect(decision.needsInbox).toBe(false);
    expect(decision.fireId).toBeUndefined();
  });

  test('missPolicy escalate marks needsInbox on miss', () => {
    const decision = decideDue({
      now: new Date('2030-01-01T02:00:00.000Z'),
      nextDueAt: new Date('2030-01-01T00:00:00.000Z'),
      catchupWindowSec: 3600,
      nodeOnline: true,
      missPolicy: 'escalate',
    });
    expect(decision.action).toBe('miss_stale');
    expect(decision.needsInbox).toBe(true);
  });

  test('missPolicy catch-up keeps default fire inside window', () => {
    const decision = decideDue({
      now: new Date('2030-01-01T01:00:00.000Z'),
      nextDueAt: new Date('2030-01-01T00:30:00.000Z'),
      catchupWindowSec: 3600,
      nodeOnline: true,
      missPolicy: 'catch-up',
      scheduleId: 'sched-1',
    });
    expect(decision.action).toBe('fire');
    expect(decision.needsInbox).toBeUndefined();
  });
});

describe('planDueBatch', () => {
  test('batch larger than catchupBatch leaves remainder for next tick', () => {
    const rows: BatchRow[] = [];
    for (let index = 0; index < 60; index += 1) {
      rows.push(row(`schedule-${index}`, '2030-01-01T00:30:00.000Z', true));
    }
    const batch = planDueBatch(rows, {
      now: new Date('2030-01-01T01:00:00.000Z'),
      catchupWindowSec: 3600,
      catchupBatch: 50,
      dueAtOf: (candidate) => candidate.dueAt,
      onlineOf: (candidate) => candidate.online,
      scheduleIdOf: (candidate) => candidate.id,
    });
    expect(batch.planned).toHaveLength(50);
    expect(batch.remainder).toBe(10);
    for (const planned of batch.planned) {
      expect(planned.decision.action).toBe('fire');
    }
  });

  test('misses do not consume fire budget', () => {
    const rows = [
      row('stale', '2029-12-31T00:00:00.000Z', true),
      row('offline', '2030-01-01T01:00:00.000Z', false),
      row('due', '2030-01-01T00:30:00.000Z', true),
    ];
    const batch = planDueBatch(rows, {
      now: new Date('2030-01-01T01:00:00.000Z'),
      catchupWindowSec: 3600,
      catchupBatch: 1,
      dueAtOf: (candidate) => candidate.dueAt,
      onlineOf: (candidate) => candidate.online,
      missPolicyOf: (candidate) => (candidate.id === 'offline' ? 'escalate' : 'catch-up'),
      scheduleIdOf: (candidate) => candidate.id,
    });
    expect(batch.planned.map((planned) => planned.decision.action)).toEqual([
      'miss_stale',
      'miss_offline',
      'fire',
    ]);
    expect(batch.remainder).toBe(0);
  });
});
