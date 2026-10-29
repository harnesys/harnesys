import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from 'harnesys';
import {
  type ConsolidationDecision,
  parseConsolidationVerdict,
  pendingEventsOf,
} from './consolidation-decisions.ts';

const CANDIDATES = [
  { text: 'alpha', scope: 'long' as const, importance: 5 },
  { text: 'beta', scope: 'session' as const, key: 'mood', importance: 3 },
  { text: 'gamma', scope: 'long' as const, importance: 7 },
];

describe('parseConsolidationVerdict', () => {
  test('filters invalid entries, accepts uppercase actions, requires existingId', () => {
    const raw = JSON.stringify({
      decisions: [
        { index: 0, action: 'add' },
        { index: 1, action: 'UPDATE', text: 'beta prime', importance: 15, existingId: 'fact-1' },
        { index: 2, action: 'noop' },
        { index: 9, action: 'add' },
        { index: 1, action: 'nuke' },
        { index: 2, action: 'SUPERSEDE', existingId: 'fact-2' },
        { index: 1, action: 'update', text: 'no target' },
        { index: 1, action: 'update', text: 'kept', existingId: 'fact-1' },
        { index: 2, action: 'supersede', text: 'stale', existingId: '' },
      ],
    });
    const decisions = parseConsolidationVerdict(raw, CANDIDATES);
    const expected: ConsolidationDecision[] = [
      { index: 0, action: 'add', importance: 5 },
      {
        index: 1,
        action: 'update',
        text: 'beta prime',
        importance: 10,
        existingId: 'fact-1',
      },
      { index: 2, action: 'noop' },
      { index: 1, action: 'update', text: 'kept', existingId: 'fact-1' },
    ];
    expect(decisions).toEqual(expected);
  });

  test('invalid JSON returns empty array', () => {
    expect(parseConsolidationVerdict('not json', CANDIDATES)).toEqual([]);
  });
});

interface E {
  type: 'user';
  text: string;
  seq?: number;
  runId?: string;
}

function ev(text: string, runId: string, seq: number): E {
  return { type: 'user', text, runId, seq };
}

function isUser(event: SessionEvent): event is Extract<SessionEvent, { type: 'user' }> {
  return event.type === 'user';
}

describe('pendingEventsOf', () => {
  const events: E[] = [
    ev('a', 'run-1', 1),
    ev('b', 'run-1', 2),
    ev('c', 'run-2', 3),
    ev('d', 'run-2', 4),
  ];

  test('no cursor returns all events', () => {
    expect(pendingEventsOf(events, undefined)).toEqual(events);
  });

  test('cursor in the middle returns strict suffix', () => {
    const pending = pendingEventsOf(events, { lastRunId: 'run-1', lastSeq: 2 });
    expect(pending.filter(isUser).map((event) => event.text)).toEqual(['c', 'd']);
  });

  test('cursor not found in the thread returns all events', () => {
    const pending = pendingEventsOf(events, { lastRunId: 'run-9', lastSeq: 99 });
    expect(pending).toEqual(events);
  });
});
