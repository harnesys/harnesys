import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '../../ports/session.ts';
import { readThreadHistory, searchThreadHistory, snippetText } from './thread-history.ts';

const THREAD = 'thread-1';

function user(threadSeq: number, text: string, conversational = true): SessionEvent {
  return {
    type: 'user',
    text,
    threadSeq,
    conversational,
    author: { provider: 'p', providerUserId: 'u', displayName: 'Ann' },
  };
}

function answer(threadSeq: number, text: string, conversational = true): SessionEvent {
  return { type: 'run.completed', text, threadSeq, conversational };
}

function tool(threadSeq: number, text: string): SessionEvent {
  return {
    type: 'tool',
    phase: 'completed',
    toolCallId: 'call-1',
    name: 'read_file',
    output: { text },
    threadSeq,
    conversational: false,
  };
}

describe('readThreadHistory', () => {
  const events = [
    user(1, 'first question'),
    answer(2, 'first answer'),
    tool(3, 'tool noise'),
    user(4, 'second question'),
    answer(5, 'second answer'),
  ];

  test('returns the newest page in thread order and skips non-conversational events', () => {
    const page = readThreadHistory(events, THREAD, {});
    expect(page.messages.map((m) => m.text)).toEqual([
      'first question',
      'first answer',
      'second question',
      'second answer',
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.oldestSeq).toBe(1);
  });

  test('pages older messages with beforeSeq and limit', () => {
    const page = readThreadHistory(events, THREAD, { beforeSeq: 5, limit: 2 });
    expect(page.messages.map((m) => m.threadSeq)).toEqual([2, 4]);
    expect(page.hasMore).toBe(true);
    expect(page.oldestSeq).toBe(2);

    const newer = readThreadHistory(events, THREAD, { limit: 2 });
    expect(newer.messages.map((m) => m.threadSeq)).toEqual([4, 5]);
    expect(newer.hasMore).toBe(true);
    expect(newer.oldestSeq).toBe(4);
  });

  test('clamps the page size and carries the author for people messages', () => {
    const page = readThreadHistory(events, THREAD, { limit: 999 });
    expect(page.messages).toHaveLength(4);
    expect(page.messages[0]).toMatchObject({ role: 'user', author: 'Ann' });
    expect(page.messages[1]?.author).toBeUndefined();
  });
});

describe('searchThreadHistory', () => {
  const events = [
    user(1, 'the invoice is shipped'),
    answer(2, 'unrelated note'),
    user(3, 'another invoice question'),
    tool(4, 'invoice inside a tool result'),
  ];

  test('returns newest conversational matches only', () => {
    const result = searchThreadHistory(events, THREAD, { query: 'invoice' });
    expect(result.hits.map((hit) => hit.threadSeq)).toEqual([3, 1]);
    expect(result.hasMore).toBe(false);
  });

  test('requires every term and honours limit', () => {
    expect(searchThreadHistory(events, THREAD, { query: 'invoice shipped' }).hits).toHaveLength(1);
    const limited = searchThreadHistory(events, THREAD, { query: 'invoice', limit: 1 });
    expect(limited.hits).toHaveLength(1);
    expect(limited.hasMore).toBe(true);
  });

  test('blank query returns nothing', () => {
    expect(searchThreadHistory(events, THREAD, { query: '   ' })).toEqual({
      hits: [],
      hasMore: false,
    });
  });
});

describe('snippetText', () => {
  test('keeps short text intact', () => {
    expect(snippetText('short', 'short')).toBe('short');
  });

  test('windows long text around the first match', () => {
    const text = `${'a'.repeat(400)} needle ${'b'.repeat(400)}`;
    const snippet = snippetText(text, 'needle');
    expect(snippet.length).toBeLessThan(text.length);
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });
});
