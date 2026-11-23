import { expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import {
  compactionCoverage,
  coveredRunCount,
  firstLiveRunIndex,
  isRunCovered,
} from './compaction-coverage';
import type { FeedRun } from './feed-types';

type CompactionEvent = Extract<SessionEvent, { type: 'compaction' }>;

function deltaEvent(runId: string, seq: number, threadSeq?: number): SessionEvent {
  return { type: 'text-delta', text: 'x', runId, seq, threadSeq };
}

function userEvent(runId: string, seq: number, threadSeq?: number): SessionEvent {
  return { type: 'user', text: 'hi', runId, seq, threadSeq };
}

function usageEvent(runId: string, seq: number, threadSeq?: number): SessionEvent {
  return {
    type: 'model.usage',
    text: 'a',
    usage: { model: 'test-model', promptTokens: 1, generatedTokens: 1 },
    runId,
    seq,
    threadSeq,
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

function run(
  index: number,
  eventCount: number,
  threadSeqRange: { first: number; last: number } | null = null,
): FeedRun {
  return {
    key: `run-${index}`,
    id: null,
    runId: undefined,
    error: null,
    terminal: null,
    firstThreadSeq: threadSeqRange?.first ?? null,
    lastThreadSeq: threadSeqRange?.last ?? null,
    events: Array.from({ length: eventCount }, (_, offset) => deltaEvent('run-x', offset)),
    segments: [],
    hasInFlight: false,
  };
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
  expect(coverage.mode).toBe('legacy');
  expect(coverage.boundaryIndex).toBe(2);
  expect(coverage.tokensBefore).toBe(100);
  expect(coverage.tokensAfter).toBe(5);
});

test('runs ending at or before the boundary are covered, later runs are not', () => {
  const events = [userEvent('run-a', 1), userEvent('run-b', 1), usageEvent('run-b', 2), COMPACTION];
  const coverage = compactionCoverage(events);
  const runs = [run(0, 1), run(1, 2), run(3, 1)];
  expect(coveredRunCount(runs, coverage)).toBe(2);
  expect(firstLiveRunIndex(runs, coverage)).toBe(2);
});

test('compaction without a boundary reference yields no coverage', () => {
  const events = [userEvent('run-a', 1), compactionEvent({ coveredUntil: 0, coveredFrom: 0 })];
  const coverage = compactionCoverage(events);
  expect(coverage.mode).toBe('none');
  expect(coverage.boundaryIndex).toBe(-1);
  expect(isRunCovered(run(0, 1), coverage)).toBe(false);
  expect(firstLiveRunIndex([run(0, 1)], coverage)).toBe(-1);
});

test('windowed slice dims runs by thread seq', () => {
  const events = [
    userEvent('run-a', 1, 10),
    userEvent('run-b', 1, 20),
    deltaEvent('run-b', 2, 21),
    compactionEvent({ coveredUntilThreadSeq: 21 }),
  ];
  const coverage = compactionCoverage(events);
  const firstRun = run(0, 1, { first: 10, last: 10 });
  const secondRun = run(1, 2, { first: 20, last: 21 });
  const runs = [firstRun, secondRun];
  expect(coverage.mode).toBe('seq');
  expect(coverage.boundaryThreadSeq).toBe(21);
  expect(isRunCovered(firstRun, coverage)).toBe(true);
  expect(isRunCovered(secondRun, coverage)).toBe(true);
  expect(coveredRunCount(runs, coverage)).toBe(2);
  expect(firstLiveRunIndex(runs, coverage)).toBe(-1);
});

test('unresolved boundary never dims and never splits', () => {
  const events = [userEvent('run-a', 1, 10), compactionEvent({ coveredUntilThreadSeq: null })];
  const coverage = compactionCoverage(events);
  const runs = [run(0, 1, { first: 10, last: 10 }), run(1, 1, { first: 11, last: 11 })];
  expect(coverage.mode).toBe('none');
  expect(coveredRunCount(runs, coverage)).toBe(0);
  expect(firstLiveRunIndex(runs, coverage)).toBe(-1);
});

test('legacy anchor inside the loaded window keeps index math', () => {
  const events = [userEvent('run-a', 1), userEvent('run-b', 1), usageEvent('run-b', 2), COMPACTION];
  const coverage = compactionCoverage(events);
  const runs = [run(0, 1), run(1, 2), run(2, 1)];
  expect(coveredRunCount(runs, coverage)).toBe(2);
  expect(firstLiveRunIndex(runs, coverage)).toBe(2);
});

test('a boundary outside the loaded slice does not split the window', () => {
  const before = compactionCoverage([compactionEvent({ coveredUntilThreadSeq: 5 })]);
  const after = compactionCoverage([compactionEvent({ coveredUntilThreadSeq: 500 })]);
  const runs = [run(0, 1, { first: 100, last: 100 }), run(1, 1, { first: 200, last: 200 })];
  expect(firstLiveRunIndex(runs, before)).toBe(-1);
  expect(coveredRunCount(runs, before)).toBe(0);
  expect(firstLiveRunIndex(runs, after)).toBe(-1);
  expect(coveredRunCount(runs, after)).toBe(2);
});
