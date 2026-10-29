import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from 'harnesys';
import {
  type BranchThreadRef,
  collectInheritedEvents,
  cutParentEvents,
  seedMessagesFromEvents,
} from './fork-logs.ts';

function user(text: string, runId: string, seq: number): SessionEvent {
  return { type: 'user', text, runId, seq } as SessionEvent;
}

function delta(text: string, runId: string, seq: number): SessionEvent {
  return { type: 'text-delta', text, runId, seq } as SessionEvent;
}

describe('cutParentEvents', () => {
  test('cuts through the end of the fork run', () => {
    const events = [
      user('a', 'r1', 1),
      delta('A', 'r1', 2),
      user('b', 'r2', 3),
      delta('B', 'r2', 4),
    ];
    expect(cutParentEvents(events, 'r1')).toEqual(events.slice(0, 2));
  });

  test('falls back to event id match', () => {
    const withIds = [
      { type: 'user', text: 'a', clientEventId: 'c1' },
      { type: 'user', text: 'b', clientEventId: 'c2' },
    ] as SessionEvent[];
    expect(cutParentEvents(withIds, 'c1')).toEqual(withIds.slice(0, 1));
  });

  test('returns empty when fork point is unknown', () => {
    expect(cutParentEvents([user('a', 'r1', 1)], 'missing')).toEqual([]);
  });
});

describe('seedMessagesFromEvents', () => {
  test('groups user prompts and assistant deltas', () => {
    const events = [
      user('a', 'r1', 1),
      delta('A1', 'r1', 2),
      delta('A2', 'r1', 3),
      user('b', 'r2', 4),
    ];
    expect(seedMessagesFromEvents(events)).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'A1A2' },
      { role: 'user', content: 'b' },
    ]);
  });
});

describe('collectInheritedEvents', () => {
  test('walks nested branches', async () => {
    const threads = new Map<string, BranchThreadRef>([
      ['child', { id: 'child', parentThreadId: 'mid', forkAt: 'rm' }],
      ['mid', { id: 'mid', parentThreadId: 'root', forkAt: 'rr' }],
      ['root', { id: 'root', parentThreadId: null, forkAt: null }],
    ]);
    const stored = new Map<string, SessionEvent[]>([
      ['root', [user('a', 'rr', 1), delta('A', 'rr', 2), user('late', 'rx', 3)]],
      ['mid', [user('m', 'rm', 1)]],
    ]);
    const inherited = await collectInheritedEvents(
      (id) => Promise.resolve(stored.get(id) ?? []),
      (id) => threads.get(id),
      { id: 'child', parentThreadId: 'mid', forkAt: 'rm' },
    );
    expect(inherited).toEqual([user('a', 'rr', 1), delta('A', 'rr', 2), user('m', 'rm', 1)]);
  });

  test('returns empty for root threads and missing parents', async () => {
    const none = await collectInheritedEvents(
      () => Promise.resolve([]),
      () => undefined,
      { id: 'lonely', parentThreadId: 'gone', forkAt: 'r' },
    );
    expect(none).toEqual([]);
  });
});
