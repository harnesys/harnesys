import { describe, expect, test } from 'bun:test';
import {
  comparePendingPlacements,
  decidePendingReconcile,
  effectivePriority,
  type PendingPlacement,
  sortPendingPlacements,
  upsertPendingPlacement,
} from './pending-placement.ts';

function row(
  partial: Partial<PendingPlacement> & Pick<PendingPlacement, 'runId' | 'createdAt' | 'priority'>,
): PendingPlacement {
  return {
    orgId: 'org-1',
    threadId: 'thread-1',
    profileId: 'profile-1',
    configRevision: 1,
    lastReason: 'waiting',
    attempt: 0,
    trigger: { kind: 'issue', id: partial.runId },
    expiresAt: null,
    payload: { agentId: 'agent-1', text: 'hi' },
    lastCandidatesJson: '[]',
    ...partial,
  };
}

describe('effectivePriority / sortPendingPlacements', () => {
  test('ages issue priority one step per 30 minutes and tie-breaks FIFO+runId', () => {
    const nowMs = Date.parse('2030-01-01T01:00:00.000Z');
    const criticalFresh = row({
      runId: 'run-c',
      priority: 1,
      createdAt: '2030-01-01T00:50:00.000Z',
    });
    const lowAged = row({
      runId: 'run-a',
      priority: 4,
      createdAt: '2030-01-01T00:00:00.000Z',
    });
    const lowFresh = row({
      runId: 'run-b',
      priority: 4,
      createdAt: '2030-01-01T00:55:00.000Z',
    });
    expect(effectivePriority(4, '2030-01-01T00:00:00.000Z', nowMs)).toBe(2);
    expect(effectivePriority(4, '2030-01-01T00:55:00.000Z', nowMs)).toBe(4);
    const sorted = sortPendingPlacements([lowFresh, lowAged, criticalFresh], nowMs);
    expect(sorted.map((item) => item.runId)).toEqual(['run-c', 'run-a', 'run-b']);
    expect(comparePendingPlacements(lowAged, lowFresh, nowMs)).toBeLessThan(0);
  });
});

describe('upsertPendingPlacement', () => {
  test('keeps attempt and createdAt on idempotent re-apply for same runId', () => {
    const first = row({
      runId: 'run-1',
      priority: 3,
      createdAt: '2030-01-01T00:00:00.000Z',
      attempt: 2,
      lastReason: 'offline',
    });
    const next = row({
      runId: 'run-1',
      priority: 2,
      createdAt: '2030-01-01T03:00:00.000Z',
      attempt: 0,
      lastReason: 'source-not-ready',
      configRevision: 9,
    });
    const applied = upsertPendingPlacement(first, next);
    expect(applied.attempt).toBe(2);
    expect(applied.createdAt).toBe('2030-01-01T00:00:00.000Z');
    expect(applied.lastReason).toBe('source-not-ready');
    expect(applied.priority).toBe(2);
    expect(applied.configRevision).toBe(9);
  });
});

describe('decidePendingReconcile', () => {
  test('re-enqueues missing command for active claim and resolves expired claim', () => {
    const pending = row({
      runId: 'run-1',
      priority: 3,
      createdAt: '2030-01-01T00:00:00.000Z',
    });
    expect(
      decidePendingReconcile({
        runStatus: 'waiting',
        pending,
        claim: {
          nodeId: 'node-1',
          leaseEpoch: 2,
          doneAt: null,
          leaseUntil: '2030-01-01T01:00:00.000Z',
        },
        hasCommand: false,
        nowIso: '2030-01-01T00:30:00.000Z',
      }),
    ).toEqual({ kind: 'reenqueue', nodeId: 'node-1', leaseEpoch: 2 });
    expect(
      decidePendingReconcile({
        runStatus: 'waiting',
        pending,
        claim: {
          nodeId: 'node-1',
          leaseEpoch: 2,
          doneAt: null,
          leaseUntil: '2030-01-01T00:10:00.000Z',
        },
        hasCommand: false,
        nowIso: '2030-01-01T00:30:00.000Z',
      }),
    ).toEqual({ kind: 'resolve' });
    expect(
      decidePendingReconcile({
        runStatus: 'running',
        pending,
        claim: null,
        hasCommand: false,
        nowIso: '2030-01-01T00:30:00.000Z',
      }),
    ).toEqual({ kind: 'delete' });
  });
});
