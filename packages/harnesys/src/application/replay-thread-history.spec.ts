import { expect, test } from 'bun:test';
import type { SessionEvent } from '../ports/session.ts';
import type { MessageSource } from './message-source.ts';
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

test('orphans of a user-stopped run are repaired as cancelled_by_user', () => {
  const events = [
    userEvent('hi', 'r1', 1),
    {
      type: 'model.usage',
      text: '',
      toolCalls: [{ id: 'lost', name: 'agents_wait' }],
      usage: {},
      runId: 'r1',
      seq: 2,
    } as SessionEvent,
    { type: 'run.cancelled', reason: 'run cancelled', runId: 'r1', seq: 3 } as SessionEvent,
  ];
  const messages = rebuildThreadMessages(events);
  const tool = messages[messages.length - 1] as { role: string; content: string };
  expect(tool.role).toBe('tool');
  expect(tool.content).toContain('"cancelled_by_user"');
  expect(tool.content).not.toContain('before user decision');
});

test('orphans of a run closed without a stop stay on the abandoned wording', () => {
  const events = [
    userEvent('hi', 'r1', 1),
    {
      type: 'model.usage',
      text: '',
      toolCalls: [{ id: 'lost', name: 'agents_wait' }],
      usage: {},
      runId: 'r1',
      seq: 2,
    } as SessionEvent,
    { type: 'run.cancelled', reason: 'budget_exceeded', runId: 'r1', seq: 3 } as SessionEvent,
  ];
  const messages = rebuildThreadMessages(events);
  const tool = messages[messages.length - 1] as { role: string; content: string };
  expect(tool.content).toContain('before user decision');
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

test('compaction with a covered boundary keeps the protected tail', () => {
  const events = [
    userEvent('old', 'r1', 1),
    usageEvent('a', 'r1', 2),
    // boundary: last covered event is r1:2; the later user turn stays visible
    {
      type: 'compaction',
      id: 'c1',
      reason: 'manual',
      coveredFrom: 0,
      coveredUntil: 1,
      tokensBefore: 10,
      tokensAfter: 2,
      summary: 'summary',
      coveredUntilRunId: 'r1',
      coveredUntilSeq: 2,
      runId: 'r2',
      seq: 4,
    } as SessionEvent,
    userEvent('tail', 'r2', 1),
    usageEvent('reply', 'r3', 2),
  ];
  const sources: number[] = [];
  const messages = rebuildThreadMessages(events, { messageSources: sources });
  expect(messages.length).toBe(3);
  expect(sources).toEqual([2, 3, 4]);
});

function anchorEvent(cursor: number | null | undefined, threadSeq: number): SessionEvent {
  return {
    type: 'compaction',
    id: 'c1',
    reason: 'threshold',
    coveredFrom: 0,
    coveredUntil: 1,
    tokensBefore: 10,
    tokensAfter: 2,
    summary: 'summary',
    coveredUntilThreadSeq: cursor,
    runId: 'r2',
    seq: 1,
    threadSeq,
  } as SessionEvent;
}

function historyWithAnchor(cursor: number | null | undefined): SessionEvent[] {
  return [
    { type: 'user', text: 'old', runId: 'r1', seq: 1, threadSeq: 1 } as SessionEvent,
    {
      type: 'model.usage',
      text: 'a',
      usage: {},
      runId: 'r1',
      seq: 2,
      threadSeq: 2,
    } as SessionEvent,
    anchorEvent(cursor, 3),
    { type: 'user', text: 'tail', runId: 'r2', seq: 2, threadSeq: 4 } as SessionEvent,
    {
      type: 'model.usage',
      text: 'reply',
      usage: {},
      runId: 'r3',
      seq: 1,
      threadSeq: 5,
    } as SessionEvent,
  ];
}

test('a thread cursor drops covered messages and keeps the tail', () => {
  const sources: number[] = [];
  const messages = rebuildThreadMessages(historyWithAnchor(2), { messageSources: sources });
  expect(messages.length).toBe(3);
  expect(sources).toEqual([2, 3, 4]);
});

test('an unresolved cursor keeps the whole history instead of wiping it', () => {
  const sources: number[] = [];
  const messages = rebuildThreadMessages(historyWithAnchor(null), { messageSources: sources });
  expect(messages.length).toBe(5);
  expect(sources).toEqual([0, 1, 2, 3, 4]);
});

test('the active run is exempt from cursor coverage', () => {
  const sources: number[] = [];
  const messages = rebuildThreadMessages(historyWithAnchor(2), {
    messageSources: sources,
    activeRunId: 'r1',
  });
  expect(messages.length).toBe(5);
  expect(sources).toEqual([1, 1, 2, 3, 4]);
});

test('messageSrcCoords exposes journal coordinates for each message', () => {
  const events: SessionEvent[] = [
    { type: 'user', text: 'hi', runId: 'r1', seq: 1, threadSeq: 1 } as SessionEvent,
    {
      type: 'model.usage',
      text: 'plan',
      usage: {},
      runId: 'r1',
      seq: 2,
      threadSeq: 2,
    } as SessionEvent,
    {
      type: 'tool',
      phase: 'completed',
      name: 'Grep',
      toolCallId: 'c1',
      output: 'ok',
      runId: 'r1',
      seq: 3,
      threadSeq: 3,
    } as SessionEvent,
    {
      type: 'model.usage',
      text: 'done',
      usage: {},
      runId: 'r1',
      seq: 4,
      threadSeq: 4,
    } as SessionEvent,
  ];
  const coords: MessageSource[] = [];
  const messages = rebuildThreadMessages(events, { messageSrcCoords: coords });
  expect(coords.length).toBe(messages.length);
  expect(coords[0]).toEqual({ runId: 'r1', seq: 1, threadSeq: 1 });
  expect(coords[1]).toEqual({ runId: 'r1', seq: 2, threadSeq: 2 });
  expect(coords[2]).toEqual({ runId: 'r1', seq: 3, threadSeq: 3 });
  expect(coords[3]).toEqual({ runId: 'r1', seq: 3, threadSeq: 3 });
  expect(coords[4]).toEqual({ runId: 'r1', seq: 4, threadSeq: 4 });
});

test('the compaction anchor carries the compaction event coordinates', () => {
  const events = historyWithAnchor(2);
  const coords: MessageSource[] = [];
  const messages = rebuildThreadMessages(events, { messageSrcCoords: coords });
  expect(coords.length).toBe(messages.length);
  expect(coords[0]).toEqual({ runId: 'r2', seq: 1, threadSeq: 3 });
});

test('synthetic orphan results inherit the assistant coordinates', () => {
  const events: SessionEvent[] = [
    { type: 'user', text: 'hi', runId: 'r1', seq: 1, threadSeq: 1 } as SessionEvent,
    {
      type: 'model.usage',
      text: '',
      toolCalls: [{ id: 'lost', name: 'Terminal' }],
      usage: {},
      runId: 'r1',
      seq: 2,
      threadSeq: 2,
    } as SessionEvent,
  ];
  const coords: MessageSource[] = [];
  const messages = rebuildThreadMessages(events, { messageSrcCoords: coords });
  expect(messages.length).toBe(coords.length);
  expect(coords[coords.length - 1]).toEqual({ runId: 'r1', seq: 2, threadSeq: 2 });
});
