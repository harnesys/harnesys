import { expect, test } from 'bun:test';
import type { SessionEvent } from '../ports/session.ts';
import { rebuildThreadMessages } from './replay-thread-history.ts';

function userEvent(text: string, runId: string, seq: number): SessionEvent {
  return { type: 'user', text, runId, seq } as SessionEvent;
}

function usageEvent(text: string, runId: string, seq: number): SessionEvent {
  return { type: 'model.usage', text, usage: {}, runId, seq } as SessionEvent;
}

function toolEvent(name: string, toolCallId: string, runId: string, seq: number): SessionEvent {
  return {
    type: 'tool',
    phase: 'completed',
    name,
    toolCallId,
    output: 'ok',
    runId,
    seq,
  } as SessionEvent;
}

test('messageSources maps each message to its producing event', () => {
  const events = [
    userEvent('hi', 'r1', 1),
    usageEvent('plan', 'r1', 2),
    toolEvent('Grep', 'c1', 'r1', 3),
    usageEvent('done', 'r1', 4),
  ];
  const sources: number[] = [];
  const messages = rebuildThreadMessages(events, { messageSources: sources });
  expect(messages.length).toBe(sources.length);
  expect(sources[0]).toBe(0);
  expect(sources[1]).toBe(1);
  expect(sources[sources.length - 1]).toBe(3);
});

test('synthetic repair results inherit the assistant source', () => {
  const events = [
    userEvent('hi', 'r1', 1),
    {
      type: 'model.usage',
      text: '',
      toolCalls: [{ id: 'lost', name: 'Terminal' }],
      usage: {},
      runId: 'r1',
      seq: 2,
    } as SessionEvent,
  ];
  const sources: number[] = [];
  const messages = rebuildThreadMessages(events, { messageSources: sources });
  expect(messages.length).toBe(sources.length);
  expect(sources[sources.length - 1]).toBe(1);
});

test('compaction anchor resets sources alongside messages', () => {
  const events = [
    userEvent('hi', 'r1', 1),
    usageEvent('a', 'r1', 2),
    {
      type: 'compaction',
      id: 'c1',
      reason: 'manual',
      coveredFrom: 0,
      coveredUntil: 1,
      tokensBefore: 10,
      tokensAfter: 2,
      summary: 'summary',
      runId: 'r1',
      seq: 3,
    } as SessionEvent,
    userEvent('next', 'r2', 1),
  ];
  const sources: number[] = [];
  const messages = rebuildThreadMessages(events, { messageSources: sources });
  expect(messages.length).toBe(2);
  expect(sources).toEqual([2, 3]);
});
