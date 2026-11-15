import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { createRunFold, runProcess } from './feed-run-fold';
import { runSnapshot } from './feed-run-publish';
import type { FeedChunk, FeedRun, FeedSegment, GroupFeedChunk } from './feed-types';

function user(text: string): SessionEvent {
  return { type: 'user', text };
}

function requested(toolCallId: string, name = 'Read'): SessionEvent {
  return { type: 'tool', phase: 'requested', toolCallId, name };
}

function completed(toolCallId: string): SessionEvent {
  return { type: 'tool', phase: 'completed', toolCallId, name: 'Read', output: 'ok' };
}

function reasoning(text: string): SessionEvent {
  return { type: 'reasoning-delta', text };
}

function ask(toolCallId: string): SessionEvent {
  return {
    type: 'ask',
    askId: `ask/${toolCallId}`,
    schema: {},
    source: 'permission',
    tool: { toolCallId, name: 'Read', input: {} },
  };
}

function activityItems(run: FeedRun) {
  const segment = run.segments.find((item: FeedSegment) => item.kind === 'activity');
  return segment && segment.kind === 'activity' ? segment.items : [];
}

function groupChunks(run: FeedRun): GroupFeedChunk[] {
  const item = activityItems(run).find((entry) => entry.type === 'group');
  return item && item.type === 'group' ? item.chunks : [];
}

function chunkOfType(chunks: FeedChunk[], type: string): FeedChunk | undefined {
  return chunks.find((chunk) => chunk.type === type);
}

describe('reference-stable run publishing', () => {
  test('a snapshot without new events returns the identical array', () => {
    const fold = createRunFold();
    runProcess(fold, user('hi'), 0);
    const first = runSnapshot(fold);
    expect(runSnapshot(fold)).toBe(first);
  });

  test('a tool result keeps the untouched user segment object', () => {
    const fold = createRunFold();
    runProcess(fold, user('hi'), 0);
    runProcess(fold, requested('c1'), 1);
    const before = runSnapshot(fold);
    runProcess(fold, completed('c1'), 2);
    const after = runSnapshot(fold);

    expect(after[0]).not.toBe(before[0]);
    const userSegment = (run: FeedRun) =>
      run.segments.find((segment: FeedSegment) => segment.kind === 'user');
    expect(userSegment(after[0])).toBe(userSegment(before[0]));
  });

  test('an ask on one pair reuses the sibling reasoning chunk', () => {
    const fold = createRunFold();
    runProcess(fold, requested('c1'), 0);
    runProcess(fold, reasoning('thinking'), 1);
    const before = groupChunks(runSnapshot(fold)[0]);
    runProcess(fold, ask('c1'), 2);
    const after = groupChunks(runSnapshot(fold)[0]);

    expect(chunkOfType(after, 'tools')).not.toBe(chunkOfType(before, 'tools'));
    expect(chunkOfType(after, 'reasoning')).toBe(chunkOfType(before, 'reasoning'));
  });

  test('closed runs keep their identity while the current run grows', () => {
    const fold = createRunFold();
    runProcess(fold, user('one'), 0);
    runSnapshot(fold);
    runProcess(fold, { type: 'done' }, 1);
    const closed = runSnapshot(fold)[0];
    expect(closed.terminal).toBe('done');

    runProcess(fold, user('two'), 2);
    const after = runSnapshot(fold);
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(closed);
  });
});
