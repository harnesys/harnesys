import { expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { compactionCoverage, isRunCovered } from './compaction-coverage';
import type { FeedRun } from './feed-types';

type CompactionEvent = Extract<SessionEvent, { type: 'compaction' }>;

function deltaEvent(runId: string, seq: number): SessionEvent {
  return { type: 'text-delta', text: 'x', runId, seq };
}

function userEvent(runId: string, seq: number): SessionEvent {
  return { type: 'user', text: 'hi', runId, seq };
}

function usageEvent(runId: string, seq: number): SessionEvent {
  return {
    type: 'model.usage',
    text: 'a',
    usage: { model: 'test-model', promptTokens: 1, generatedTokens: 1 },
    runId,
    seq,
  };
}

function compactionEvent(overrides?: Partial<CompactionEvent>): CompactionEvent {
  return {
    type: 'compaction',
    id: 'c1',
    reason: 'manual',
    coveredFrom: 0,
    coveredUntil: 10,
    tokensBefore: 100,
    tokensAfter: 5,
    ...overrides,
  };
}

function run(firstIndex: number, eventCount: number): FeedRun {
  return {
    key: `run-${firstIndex}`,
    id: null,
    runId: undefined,
    error: null,
    terminal: null,
    firstIndex,
    events: Array.from({ length: eventCount }, (_, index) => deltaEvent('run-x', index)),
    segments: [],
    hasInFlight: false,
  } as FeedRun;
}

const COMPACTION = compactionEvent({
  coveredUntilRunId: 'run-b',
  coveredUntilSeq: 2,
});

test('coverage points at the referenced boundary event', () => {
  const events = [
    userEvent('run-a', 1),
    usageEvent('run-b', 1),
    deltaEvent('run-b', 2),
    COMPACTION,
  ];
  const coverage = compactionCoverage(events);
  expect(coverage.boundaryIndex).toBe(2);
  expect(coverage.tokensBefore).toBe(100);
  expect(coverage.tokensAfter).toBe(5);
});

test('runs ending at or before the boundary are covered, later runs are not', () => {
  const events = [userEvent('run-a', 1), userEvent('run-b', 1), usageEvent('run-b', 2), COMPACTION];
  const coverage = compactionCoverage(events);
  expect(isRunCovered(run(0, 1), coverage.boundaryIndex)).toBe(true);
  expect(isRunCovered(run(1, 2), coverage.boundaryIndex)).toBe(true);
  expect(isRunCovered(run(3, 1), coverage.boundaryIndex)).toBe(false);
});

test('compaction without a boundary reference yields no coverage', () => {
  const events = [userEvent('run-a', 1), compactionEvent({ coveredUntil: 0, coveredFrom: 0 })];
  const coverage = compactionCoverage(events);
  expect(coverage.boundaryIndex).toBe(-1);
  expect(isRunCovered(run(0, 1), coverage.boundaryIndex)).toBe(false);
});
