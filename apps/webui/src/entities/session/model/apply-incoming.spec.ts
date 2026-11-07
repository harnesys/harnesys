import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { applyIncomingEvents } from './apply-incoming';

function delta(seq: number, text: string): SessionEvent {
  return { type: 'text-delta', runId: 'r1', seq, id: 'slot-1', text };
}

function empty() {
  return { events: [] as SessionEvent[], seenAt: {}, seqCeil: {} };
}

describe('snapshot replay during a live run', () => {
  test('a snapshot of deltas already delivered adds nothing', () => {
    const live = applyIncomingEvents(empty(), [delta(1, 'Te'), delta(2, 'st')], 1);
    expect(live.events).toHaveLength(1);
    expect(live.events[0]?.type === 'text-delta' && live.events[0].text).toBe('Test');

    const replay = applyIncomingEvents(live, [delta(1, 'Te'), delta(2, 'st')], 2);
    expect(replay.accepted).toBe(0);
    expect(replay.events).toBe(live.events);
    expect(replay.events).toHaveLength(1);
  });

  test('a snapshot starting at zero appends every delta once and coalesces the slot', () => {
    const replay = applyIncomingEvents(
      empty(),
      [delta(1, 'Отчёт '), delta(2, 'по шагу '), delta(3, '1')],
      1,
    );
    expect(replay.events).toHaveLength(1);
    const [event] = replay.events;
    expect(event?.type === 'text-delta' && event.text).toBe('Отчёт по шагу 1');
    expect(replay.seqCeil).toEqual({ r1: 3 });
  });

  test('a snapshot behind the client tail leaves the live text untouched', () => {
    const live = applyIncomingEvents(
      empty(),
      [delta(1, 'Отчёт '), delta(2, 'по шагу '), delta(3, '2/10')],
      1,
    );
    const stale = applyIncomingEvents(live, [delta(1, 'Отчёт '), delta(2, 'по шагу ')], 2);
    expect(stale.accepted).toBe(0);
    expect(stale.events).toBe(live.events);
    const [event] = stale.events;
    expect(event?.type === 'text-delta' && event.text).toBe('Отчёт по шагу 2/10');
  });

  test('a snapshot ahead of the client appends only the missing tail', () => {
    const live = applyIncomingEvents(empty(), [delta(1, 'Отчёт ')], 1);
    const healed = applyIncomingEvents(
      live,
      [delta(1, 'Отчёт '), delta(2, 'по шагу '), delta(3, '3/10')],
      2,
    );
    expect(healed.accepted).toBe(2);
    expect(healed.events).toHaveLength(1);
    const [event] = healed.events;
    expect(event?.type === 'text-delta' && event.text).toBe('Отчёт по шагу 3/10');
  });
});
