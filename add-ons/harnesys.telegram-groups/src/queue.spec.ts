import { describe, expect, test } from 'bun:test';
import type { AddonContext, SqlParam } from '@harnesys/sdk';
import { flushChannel } from './inbound.ts';
import {
  filterFresh,
  hasActiveRun,
  type InboxEntry,
  type InboxSettings,
  renderBatch,
  replyDecision,
  shouldDropAfter,
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

describe('inbound ack decision', () => {
  test('delivered, answered and self-echo outcomes release the queue rows', () => {
    for (const outcome of ['dispatched', 'auto_replied', 'skipped', 'echo_suppressed'] as const) {
      expect(shouldDropAfter(outcome)).toBe(true);
    }
  });

  test('busy and failed outcomes keep the rows for the next flush', () => {
    expect(shouldDropAfter('busy')).toBe(false);
    expect(shouldDropAfter('failed')).toBe(false);
  });
});

function queuedMessage(id: number, text: string): TelegramMessage {
  return {
    message_id: id,
    date: 0,
    text,
    chat: { id: 10, type: 'group', title: 'Design' },
    from: { id: 100, username: 'ada' },
  };
}

function flushHarness() {
  const channel = '10';
  const now = Date.now();
  const state = { omitted: 2 };
  const queue = [
    {
      id: 1,
      message_id: 100,
      payload: JSON.stringify(queuedMessage(100, 'old')),
      at: now - 120_000,
    },
    { id: 2, message_id: 101, payload: JSON.stringify(queuedMessage(101, 'new')), at: now },
  ];
  const sent: string[] = [];
  const db = {
    exec: async () => {},
    all: async (sql: string) => (sql.includes('from inbox_queue') ? queue : []),
    get: async (sql: string) => {
      if (sql.includes('from inbox_state')) {
        return { reply_message_id: null, reply_at: null, omitted: state.omitted };
      }
      if (sql.includes('from connections')) {
        return { thread_id: 't-1' };
      }
      return null;
    },
    run: async (sql: string, params?: SqlParam[]) => {
      if (sql.includes('omitted = inbox_state.omitted + excluded.omitted')) {
        state.omitted += Number(params?.[1] ?? 0);
      } else if (sql.includes('set omitted = 0')) {
        state.omitted = 0;
      }
      return { changes: 1 };
    },
    batch: async () => [],
  };
  const ctx: Partial<AddonContext> = {
    db,
    config: { get: async () => ({}) },
    log: {
      debug: async () => {},
      info: async () => {},
      warn: async () => {},
      error: async () => {},
    },
    runs: { list: async () => [] },
    bridge: {
      inbound: async (message) => {
        sent.push(message.text);
        return 'dispatched' as const;
      },
    },
  };
  return { ctx: ctx as AddonContext, channel, state, sent };
}

describe('inbox flush omitted count', () => {
  const settings: InboxSettings = {
    maxBatch: 20,
    maxChars: 3000,
    maxBacklog: 50,
    ttlSec: 60,
    replyMode: 'auto',
    replyWindowSec: 900,
    attribution: true,
  };

  test('renders the persisted omitted count once after the expired bump', async () => {
    const { ctx, channel, state, sent } = flushHarness();
    const delivered = await flushChannel(ctx, channel, settings);
    expect(delivered).toBe(true);
    expect(sent[0]).toStartWith('[+3 earlier messages omitted]');
    expect(sent[0]).not.toContain('[+4');
    expect(state.omitted).toBe(0);
  });
});
