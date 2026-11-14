import { describe, expect, test } from 'bun:test';
import {
  filterFresh,
  hasActiveRun,
  type InboxEntry,
  renderBatch,
  replyDecision,
  trimBacklog,
} from './queue.ts';
import type { TelegramMessage } from './telegram.ts';

function entry(id: number, username: string, text: string, at: number): InboxEntry {
  const message: TelegramMessage = {
    message_id: id,
    date: Math.floor(at / 1000),
    text,
    chat: { id: 10, type: 'group', title: 'Design' },
    from: { id: id + 100, username },
  };
  return { id, messageId: id, at, message };
}

describe('inbox batch render', () => {
  test('keeps the message order and attributes every line', () => {
    const rendered = renderBatch(
      [entry(1, 'ada', 'first', 0), entry(2, 'bob', 'second', 0)],
      true,
      3000,
      0,
    );
    expect(rendered.text).toBe('From @ada in Design: first\nFrom @bob in Design: second');
    expect(rendered.kept).toBe(2);
    expect(rendered.omitted).toBe(0);
  });

  test('drops the oldest lines by length and counts them in the header', () => {
    const rendered = renderBatch(
      [entry(1, 'ada', 'a'.repeat(40), 0), entry(2, 'bob', 'b'.repeat(40), 0)],
      false,
      80,
      0,
    );
    expect(rendered.text).toBe(`[+1 earlier messages omitted]\n${'b'.repeat(40)}`);
    expect(rendered.kept).toBe(1);
    expect(rendered.omitted).toBe(1);
  });

  test('adds the backlog omitted count to the header', () => {
    const rendered = renderBatch([entry(1, 'ada', 'hi', 0)], true, 3000, 4);
    expect(rendered.text).toBe('[+4 earlier messages omitted]\nFrom @ada in Design: hi');
    expect(rendered.omitted).toBe(4);
  });

  test('clips a single message that exceeds the limit', () => {
    const rendered = renderBatch([entry(1, 'ada', 'x'.repeat(100), 0)], false, 10, 0);
    expect(rendered.text).toBe('x'.repeat(10));
    expect(rendered.kept).toBe(1);
  });
});

describe('inbox backlog', () => {
  test('keeps the newest messages and counts the dropped ones', () => {
    const trim = trimBacklog([1, 2, 3, 4], 2);
    expect(trim.kept).toEqual([3, 4]);
    expect(trim.dropped).toBe(2);
  });

  test('splits entries by the ttl cut-off', () => {
    const now = 120_000;
    const split = filterFresh([entry(1, 'ada', 'old', 0), entry(2, 'bob', 'new', 61_000)], now, 60);
    expect(split.expired.map((item) => item.id)).toEqual([1]);
    expect(split.fresh.map((item) => item.id)).toEqual([2]);
  });

  test('treats queued, running, needs_input and waiting as busy', () => {
    expect(hasActiveRun([{ status: 'completed' }, { status: 'queued' }])).toBe(true);
    expect(hasActiveRun([{ status: 'needs_input' }])).toBe(true);
    expect(hasActiveRun([{ status: 'completed' }])).toBe(false);
  });
});

describe('reply anchoring', () => {
  const anchor = { messageId: 42, at: 1_000 };

  test('auto replies once and consumes the anchor', () => {
    const decision = replyDecision({
      mode: 'auto',
      anchor,
      now: 2_000,
      windowSec: 900,
      originThreadId: 'thread-1',
      boundThreadId: 'thread-1',
    });
    expect(decision).toEqual({ replyTo: 42, clear: true });
  });

  test('always replies while the anchor is inside the window', () => {
    const decision = replyDecision({
      mode: 'always',
      anchor,
      now: 2_000,
      windowSec: 900,
      originThreadId: 'thread-1',
      boundThreadId: 'thread-1',
    });
    expect(decision).toEqual({ replyTo: 42, clear: false });
  });

  test('never, a foreign thread and a stale anchor produce no reply', () => {
    const base = { anchor, now: 2_000, windowSec: 900 };
    expect(
      replyDecision({ ...base, mode: 'never', originThreadId: 't', boundThreadId: 't' }).replyTo,
    ).toBeNull();
    expect(
      replyDecision({
        ...base,
        mode: 'auto',
        originThreadId: 'thread-2',
        boundThreadId: 'thread-1',
      }).replyTo,
    ).toBeNull();
    expect(
      replyDecision({
        ...base,
        mode: 'auto',
        now: 1_000 + 900_001,
        originThreadId: 't',
        boundThreadId: 't',
      }),
    ).toEqual({ replyTo: null, clear: true });
  });
});
