import { describe, expect, test } from 'bun:test';
import type { AddonContext, SqlParam } from '@harnesys/sdk';
import { groupMessages, handleGroup, mimeOf } from './inbound.ts';
import type { TelegramFileRef, TelegramMessage } from './telegram.ts';

function message(overrides: Partial<TelegramMessage>): TelegramMessage {
  return {
    message_id: 1,
    date: 0,
    chat: { id: 100, type: 'private' },
    from: { id: 7, is_bot: false },
    ...overrides,
  };
}

describe('media grouping', () => {
  test('keeps single messages separate', () => {
    const groups = groupMessages([message({ message_id: 1 }), message({ message_id: 2 })]);
    expect(groups).toHaveLength(2);
  });

  test('groups album messages by media_group_id', () => {
    const groups = groupMessages([
      message({ message_id: 1, media_group_id: 'g1' }),
      message({ message_id: 2 }),
      message({ message_id: 3, media_group_id: 'g1' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.map((entry) => entry.message_id)).toEqual([1, 3]);
  });
});

describe('attachment mime', () => {
  const document: TelegramFileRef = { file_id: 'f1', mime_type: 'application/pdf' };

  test('prefers the mime type reported by Telegram', () => {
    expect(mimeOf(document, 'report.txt')).toBe('application/pdf');
  });

  test('infers the mime type from the file extension', () => {
    expect(mimeOf({ file_id: 'f2' }, 'photos/pic.PNG')).toBe('image/png');
    expect(mimeOf({ file_id: 'f3' }, 'report.pdf')).toBe('application/pdf');
  });

  test('falls back to octet-stream when nothing else is known', () => {
    expect(mimeOf({ file_id: 'f4' }, undefined)).toBe('application/octet-stream');
  });
});

describe('pairing gate', () => {
  interface SentMessage {
    text?: string;
  }

  function pairingHarness() {
    const sent: SentMessage[] = [];
    const pairingRows: unknown[][] = [];
    const partial: Partial<AddonContext> = {
      db: {
        exec: async () => {},
        all: async () => [],
        get: async () => null,
        run: async (_sql: string, params?: SqlParam[]) => {
          pairingRows.push(params ?? []);
          return { changes: 1 };
        },
        batch: async () => [],
      },
      log: {
        debug: async () => {},
        info: async () => {},
        warn: async () => {},
        error: async () => {},
      },
      http: {
        fetch: async (params: { body: string }) => {
          sent.push(JSON.parse(params.body) as SentMessage);
          return { status: 200, body: JSON.stringify({ ok: true, result: true }) };
        },
      },
    };
    return { ctx: partial as AddonContext, sent, pairingRows };
  }

  test('/start in a private chat issues a pair code', async () => {
    const fake = pairingHarness();
    await handleGroup(fake.ctx, [
      {
        message_id: 1,
        date: 0,
        text: '/start',
        chat: { id: 100, type: 'private' },
        from: { id: 42 },
      },
    ]);
    expect(fake.pairingRows.length).toBe(1);
    expect(fake.pairingRows[0]?.[2]).toBe('pending');
    expect(fake.sent[0]?.text).toContain('Pair code:');
  });

  test('/start with a trailing bot mention still issues a code', async () => {
    const fake = pairingHarness();
    await handleGroup(fake.ctx, [
      {
        message_id: 2,
        date: 0,
        text: '/start@harny_assistant_bot',
        chat: { id: 100, type: 'private' },
        from: { id: 42 },
      },
    ]);
    expect(fake.sent[0]?.text).toContain('Pair code:');
  });

  test('an unpaired plain message does not pair and asks to /start', async () => {
    const fake = pairingHarness();
    await handleGroup(fake.ctx, [
      {
        message_id: 3,
        date: 0,
        text: 'hello',
        chat: { id: 100, type: 'private' },
        from: { id: 42 },
      },
    ]);
    expect(fake.pairingRows.length).toBe(0);
    expect(fake.sent[0]?.text).toContain('not paired');
  });
});
