import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from 'harnesys';
import { projectThreadEvents } from './thread-events-projection.ts';

function delta(text: string, seq: number, threadSeq: number, id = 'reasoning-0'): SessionEvent {
  return { type: 'reasoning-delta', text, id, runId: 'run-1', seq, threadSeq } as SessionEvent;
}

function toolEvent(input: {
  phase: 'streaming' | 'completed';
  seq: number;
  threadSeq: number;
  delta?: string;
  output?: string;
}): SessionEvent {
  return {
    type: 'tool',
    phase: input.phase,
    toolCallId: 'call-1',
    name: 'shell',
    runId: 'run-1',
    seq: input.seq,
    threadSeq: input.threadSeq,
    ...(input.delta === undefined ? {} : { delta: input.delta }),
    ...(input.output === undefined ? {} : { output: input.output }),
  } as SessionEvent;
}

describe('projectThreadEvents', () => {
  test('merges consecutive deltas of one block and keeps the last seq', () => {
    const events = projectThreadEvents([
      delta('The', 1, 1),
      delta(' user', 2, 2),
      delta(' asks', 3, 3),
    ]);
    expect(events).toHaveLength(1);
    const merged = events[0] as { text: string; seq: number; threadSeq: number };
    expect(merged.text).toBe('The user asks');
    expect(merged.seq).toBe(3);
    expect(merged.threadSeq).toBe(3);
  });

  test('breaks the merge when a tool call sits between blocks', () => {
    const events = projectThreadEvents([
      delta('a', 1, 1),
      toolEvent({ phase: 'completed', seq: 2, threadSeq: 2, output: 'ok' }),
      delta('b', 3, 3),
    ]);
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      'reasoning-delta',
      'tool',
      'reasoning-delta',
    ]);
  });

  test('merges streaming tool input', () => {
    const events = projectThreadEvents([
      toolEvent({ phase: 'streaming', seq: 1, threadSeq: 1, delta: '{"a"' }),
      toolEvent({ phase: 'streaming', seq: 2, threadSeq: 2, delta: ':1}' }),
    ]);
    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe('{"a":1}');
  });

  test('truncates oversized tool output and flags it', () => {
    const output = 'x'.repeat(5000);
    const events = projectThreadEvents([
      toolEvent({ phase: 'completed', seq: 1, threadSeq: 1, output }),
    ]);
    const trimmed = events[0] as { output: string; outputTruncated?: boolean };
    expect(trimmed.output.length).toBe(2048);
    expect(trimmed.outputTruncated).toBe(true);
  });

  test('drops duplicated payload from model usage events', () => {
    const usage = {
      type: 'model.usage',
      usage: { model: 'm', promptTokens: 1, generatedTokens: 1 },
      text: 'duplicate',
      toolCalls: [{ id: 'c1', name: 'shell' }],
      runId: 'run-1',
      seq: 1,
      threadSeq: 1,
    } as SessionEvent;
    const [event] = projectThreadEvents([usage]) as Array<Record<string, unknown>>;
    expect(event?.text).toBeUndefined();
    expect(event?.toolCalls).toBeUndefined();
    expect(event?.usage).toBeDefined();
  });

  test('keeps only the last model stats event', () => {
    const stats = (seq: number) =>
      ({
        type: 'model.stats',
        tools: 1,
        deferredPending: 0,
        systemChars: 1,
        notesChars: 0,
        notesErrors: [],
        seq,
        threadSeq: seq,
      }) as SessionEvent;
    const events = projectThreadEvents([stats(1), stats(2), stats(3)]);
    expect(events).toHaveLength(1);
    expect((events[0] as { seq: number }).seq).toBe(3);
  });
});
