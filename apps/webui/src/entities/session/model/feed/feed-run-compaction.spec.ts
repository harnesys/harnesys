import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { hasCompactedAnchor, hasRunningCompaction, splitRuns } from './feed-run-fold';
import type { FeedRun, FeedSegment } from './feed-types';

function user(text: string): SessionEvent {
  return { type: 'user', text };
}

function started(id: string): SessionEvent {
  return {
    type: 'compaction.progress',
    id,
    phase: 'started',
    reason: 'manual',
    coveredFrom: 0,
    coveredUntil: 4,
  };
}

function failed(id: string): SessionEvent {
  return { type: 'compaction.progress', id, phase: 'failed', message: 'summary model died' };
}

function anchor(id: string): SessionEvent {
  return {
    type: 'compaction',
    id,
    reason: 'manual',
    coveredFrom: 0,
    coveredUntil: 4,
    tokensBefore: 900,
    tokensAfter: 120,
    summary: 'old work summarized',
    coveredUntilThreadSeq: 12,
  };
}

function text(id: string, value: string): SessionEvent {
  return { type: 'text-delta', text: value, id };
}

function compactionSegments(run: FeedRun): Extract<FeedSegment, { kind: 'compaction' }>[] {
  return run.segments.filter(
    (segment): segment is Extract<FeedSegment, { kind: 'compaction' }> =>
      segment.kind === 'compaction',
  );
}

describe('compaction progress fold', () => {
  test('a started marker opens a running card', () => {
    const runs = splitRuns([started('a1')]);
    const segments = runs.flatMap(compactionSegments);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.meta.status).toBe('running');
    expect(hasRunningCompaction(runs[runs.length - 1])).toBe(true);
    expect(hasCompactedAnchor(runs[runs.length - 1])).toBe(false);
  });

  test('the anchor upgrades the running card in place by id', () => {
    const runs = splitRuns([user('hi'), started('a1'), text('t1', ' mid text'), anchor('a1')]);
    expect(runs).toHaveLength(1);
    const segments = compactionSegments(runs[0]);
    expect(segments).toHaveLength(1);
    const meta = segments[0]?.meta;
    expect(meta?.status).toBe('completed');
    expect(meta?.summary).toBe('old work summarized');
    expect(meta?.tokensBefore).toBe(900);
    expect(meta?.coveredUntilThreadSeq).toBe(12);
    expect(segments[0]?.text).toContain('mid text');
    expect(hasRunningCompaction(runs[0])).toBe(false);
    expect(hasCompactedAnchor(runs[0])).toBe(true);
  });

  test('a failed marker closes the running card with its message', () => {
    const runs = splitRuns([started('a1'), failed('a1')]);
    const segments = runs.flatMap(compactionSegments);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.meta.status).toBe('failed');
    expect(segments[0]?.meta.message).toBe('summary model died');
  });

  test('an anchor without a marker still renders a completed card', () => {
    const runs = splitRuns([user('hi'), anchor('a1')]);
    const segments = runs.flatMap(compactionSegments);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.meta.status).toBe('completed');
  });

  test('a running marker that is no longer at the feed tail becomes interrupted', () => {
    const runs = splitRuns([started('a1'), { type: 'run.completed' }, user('next')]);
    const segments = runs.flatMap(compactionSegments);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.meta.status).toBe('interrupted');
    expect(hasRunningCompaction(runs[runs.length - 1])).toBe(false);
  });

  test('the running card keeps running while it is the feed tail', () => {
    const runs = splitRuns([user('hi'), started('a1')]);
    const segments = runs.flatMap(compactionSegments);
    expect(segments[0]?.meta.status).toBe('running');
    expect(hasRunningCompaction(runs[runs.length - 1])).toBe(true);
  });
});
