import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { normalizeThreadEvents } from './normalize-events';

function delta(seq: number, text: string, id = 'slot-1'): SessionEvent {
  return { type: 'text-delta', runId: 'r1', seq, id, text };
}

function stats(seq: number, threadSeq: number): SessionEvent {
  return {
    type: 'model.stats',
    runId: 'r1',
    seq,
    threadSeq,
    tools: 0,
    deferredPending: 0,
    systemChars: 0,
    notesChars: 0,
    notesErrors: [],
  };
}

function userEvent(threadSeq: number, seq: number, clientEventId: string): SessionEvent {
  return { type: 'user', text: 'START', runId: 'r1', seq, threadSeq, clientEventId };
}

describe('normalizeThreadEvents', () => {
  test('coalesces continuation deltas of one stream slot', () => {
    const normalized = normalizeThreadEvents([delta(1, 'A'), delta(2, 'B'), delta(3, 'C')]);
    expect(normalized).toHaveLength(1);
    const [event] = normalized;
    expect(event?.type === 'text-delta' && event.text).toBe('ABC');
  });

  test('keeps only the last model.stats event and its position', () => {
    const normalized = normalizeThreadEvents([
      stats(1, 1),
      userEvent(2, 2, 'ce-1'),
      stats(3, 3),
      delta(4, 'A'),
    ]);
    expect(normalized.map((event) => event.type)).toEqual(['user', 'model.stats', 'text-delta']);
    expect(normalized[1]?.threadSeq).toBe(3);
  });

  test('a log without model.stats keeps every other event', () => {
    const normalized = normalizeThreadEvents([userEvent(1, 1, 'ce-1'), delta(2, 'A')]);
    expect(normalized.map((event) => event.type)).toEqual(['user', 'text-delta']);
  });
});
