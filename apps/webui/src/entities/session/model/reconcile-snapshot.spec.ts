import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { applyIncomingEvents } from './apply-incoming';
import { mergeSeqCeil, reconcileSnapshot, sameThreadLog } from './reconcile-snapshot';

function userEvent(threadSeq: number, seq: number, clientEventId: string): SessionEvent {
  return { type: 'user', text: 'START', runId: 'r1', seq, threadSeq, clientEventId };
}

function delta(threadSeq: number, seq: number, text: string, id = 'slot-1'): SessionEvent {
  return { type: 'text-delta', runId: 'r1', seq, threadSeq, id, text };
}

function toolDone(threadSeq: number, seq: number, toolCallId: string): SessionEvent {
  return {
    type: 'tool',
    phase: 'completed',
    runId: 'r1',
    seq,
    threadSeq,
    toolCallId,
    name: 'bash',
  };
}

function toolDelta(threadSeq: number, seq: number, text: string): SessionEvent {
  return {
    type: 'tool',
    phase: 'streaming',
    runId: 'r1',
    seq,
    threadSeq,
    toolCallId: 't1',
    name: 'bash',
    delta: text,
  };
}

function live(events: SessionEvent[]) {
  return applyIncomingEvents({ events: [], seenAt: {}, seqCeil: {} }, events, 1);
}

function textOf(events: SessionEvent[]): string {
  let text = '';
  for (const event of events) {
    if (event.type === 'text-delta') {
      text += event.text;
    }
  }
  return text;
}

function toolInputOf(events: SessionEvent[]): string {
  let text = '';
  for (const event of events) {
    if (event.type === 'tool') {
      text += event.delta ?? '';
    }
  }
  return text;
}

describe('reconcile after a reload during a live run', () => {
  test('live events ahead of the snapshot no longer hide the run history', () => {
    const snapshot: SessionEvent[] = [
      userEvent(1, 1, 'ce-1'),
      { type: 'run.started', attempt: 1, runId: 'r1', seq: 2, threadSeq: 2 },
      delta(3, 3, 'Hello '),
      delta(4, 4, 'world'),
      toolDone(5, 5, 't1'),
      delta(6, 6, 'tail', 'slot-2'),
    ];
    const state = live([toolDone(5, 5, 't1'), delta(6, 6, 'tail', 'slot-2')]);
    expect(state.seqCeil).toEqual({ r1: 6 });

    const merged = reconcileSnapshot(state.events, snapshot);
    expect(merged.map((event) => event.type)).toEqual([
      'user',
      'run.started',
      'text-delta',
      'tool',
      'text-delta',
    ]);
    expect(textOf(merged)).toBe('Hello worldtail');
    expect(merged.filter((event) => event.type === 'tool')).toHaveLength(1);
  });

  test('a snapshot applied to an empty log stays intact', () => {
    const snapshot = [userEvent(1, 1, 'ce-1'), delta(2, 2, 'A'), delta(3, 3, 'B')];
    const merged = reconcileSnapshot([], snapshot);
    expect(merged.map((event) => event.type)).toEqual(['user', 'text-delta']);
    expect(textOf(merged)).toBe('AB');
  });

  test('earlier runs survive a reconcile of the active run', () => {
    const previous: SessionEvent = {
      type: 'user',
      text: 'OLD',
      runId: 'r0',
      seq: 1,
      threadSeq: 1,
      clientEventId: 'ce-0',
    };
    const snapshot = [previous, userEvent(2, 1, 'ce-1'), delta(3, 2, 'A')];
    const merged = reconcileSnapshot(live([delta(3, 2, 'A')]).events, snapshot);
    expect(merged.map((event) => event.runId)).toEqual(['r0', 'r1', 'r1']);
    expect(merged[0]).toEqual(previous);
  });
});

describe('coalesced slots spanning the snapshot boundary', () => {
  test('a text slot keeps the journal prefix and the live suffix exactly once', () => {
    const snapshot = [
      userEvent(1, 1, 'ce-1'),
      delta(2, 2, 'A'),
      delta(3, 3, 'B'),
      delta(4, 4, 'C'),
    ];
    const state = live([delta(3, 3, 'B'), delta(4, 4, 'C'), delta(5, 5, 'D')]);
    const merged = reconcileSnapshot(state.events, snapshot);
    expect(merged.map((event) => event.type)).toEqual(['user', 'text-delta']);
    expect(textOf(merged)).toBe('ABCD');
  });

  test('a slot opened after the reload joins the journal prefix', () => {
    const snapshot = [delta(1, 1, 'A'), delta(2, 2, 'B'), delta(3, 3, 'C')];
    const state = live([delta(3, 3, 'C'), delta(4, 4, 'D')]);
    expect(textOf(reconcileSnapshot(state.events, snapshot))).toBe('ABCD');
  });

  test('a slot fully beyond the boundary is appended once', () => {
    const snapshot = [delta(1, 1, 'A'), delta(2, 2, 'B')];
    const state = live([delta(3, 3, 'C'), delta(4, 4, 'D')]);
    const merged = reconcileSnapshot(state.events, snapshot);
    expect(textOf(merged)).toBe('ABCD');
    expect(merged).toHaveLength(1);
  });

  test('a tool input slot merges across the boundary', () => {
    const snapshot = [toolDelta(1, 1, '{"a"'), toolDelta(2, 2, ':1}')];
    const state = live([toolDelta(2, 2, ':1}'), toolDelta(3, 3, ' extra')]);
    const merged = reconcileSnapshot(state.events, snapshot);
    expect(toolInputOf(merged)).toBe('{"a":1} extra');
    expect(merged).toHaveLength(1);
  });

  test('a journal slot ahead of the client wins', () => {
    const snapshot = [delta(1, 1, 'A'), delta(2, 2, 'B'), delta(3, 3, 'C')];
    const state = live([delta(1, 1, 'A'), delta(2, 2, 'B')]);
    expect(textOf(reconcileSnapshot(state.events, snapshot))).toBe('ABC');
  });

  test('a slot with a delivery gap is healed from the journal', () => {
    const snapshot = [delta(1, 1, 'A'), delta(2, 2, 'B'), delta(3, 3, 'C')];
    const state = live([delta(1, 1, 'A'), delta(3, 3, 'C')]);
    expect(textOf(reconcileSnapshot(state.events, snapshot))).toBe('ABC');
  });

  test('two slots of the same id keep the journal row between them', () => {
    const snapshot = [delta(1, 1, 'A'), toolDone(2, 2, 't1'), delta(3, 3, 'B'), delta(4, 4, 'C')];
    const state = live([
      delta(1, 1, 'A'),
      toolDone(2, 2, 't1'),
      delta(3, 3, 'B'),
      delta(4, 4, 'C'),
    ]);
    const merged = reconcileSnapshot(state.events, snapshot);
    expect(merged.map((event) => event.type)).toEqual(['text-delta', 'tool', 'text-delta']);
    expect(textOf(merged)).toBe('ABC');
  });
});

describe('optimistic and persisted identity', () => {
  test('an optimistic user message survives an empty snapshot', () => {
    const optimistic: SessionEvent = { type: 'user', text: 'hi', clientEventId: 'ce-x' };
    expect(reconcileSnapshot([optimistic], [])).toEqual([optimistic]);
  });

  test('a persisted user message replaces the optimistic one', () => {
    const optimistic: SessionEvent = { type: 'user', text: 'hi', clientEventId: 'ce-x' };
    const merged = reconcileSnapshot([optimistic], [userEvent(1, 1, 'ce-x')]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(userEvent(1, 1, 'ce-x'));
  });

  test('an empty snapshot drops journal rows the server no longer has', () => {
    const state = live([delta(1, 1, 'A'), delta(2, 2, 'B')]);
    expect(reconcileSnapshot(state.events, [])).toEqual([]);
  });
});

describe('reconcile stability', () => {
  test('reconciling the same snapshot twice is a no-op', () => {
    const snapshot = [userEvent(1, 1, 'ce-1'), delta(2, 2, 'A'), delta(3, 3, 'B')];
    const state = live([delta(3, 3, 'B')]);
    const once = reconcileSnapshot(state.events, snapshot);
    const twice = reconcileSnapshot(once, snapshot);
    expect(sameThreadLog(once, twice)).toBe(true);
  });

  test('the live tail beyond the snapshot is never dropped', () => {
    const snapshot = [userEvent(1, 1, 'ce-1'), delta(2, 2, 'A')];
    const state = live([delta(2, 2, 'A'), toolDone(3, 3, 't1'), delta(4, 4, 'B', 'slot-2')]);
    const merged = reconcileSnapshot(state.events, snapshot);
    expect(merged.map((event) => event.threadSeq)).toEqual([1, 2, 3, 4]);
    expect(textOf(merged)).toBe('AB');
  });

  test('sameThreadLog distinguishes text, order and keyless events', () => {
    const left = [delta(1, 1, 'A')];
    expect(sameThreadLog(left, [delta(1, 1, 'A')])).toBe(true);
    expect(sameThreadLog(left, [delta(1, 1, 'B')])).toBe(false);
    expect(sameThreadLog(left, [])).toBe(false);
    const keyless: SessionEvent = { type: 'error', code: 'x', message: 'boom' };
    expect(sameThreadLog([keyless], [{ ...keyless }])).toBe(false);
    expect(sameThreadLog([keyless], [keyless])).toBe(true);
  });
});

describe('mergeSeqCeil', () => {
  test('the ceiling never regresses and absorbs new runs', () => {
    const snapshot = [userEvent(1, 1, 'ce-1'), delta(2, 2, 'A')];
    expect(mergeSeqCeil({ r1: 50 }, snapshot)).toEqual({ r1: 50 });
    expect(mergeSeqCeil({ r1: 1 }, snapshot)).toEqual({ r1: 2 });
    expect(mergeSeqCeil({ r0: 9 }, snapshot)).toEqual({ r0: 9, r1: 2 });
  });
});
