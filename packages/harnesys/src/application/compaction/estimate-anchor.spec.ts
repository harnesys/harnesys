import { describe, expect, test } from 'bun:test';
import {
  estimateMessageTokens,
  estimateTokens,
  estimateTokensAnchored,
  textTokensOf,
  usageAnchorOf,
} from './estimate.ts';

describe('usageAnchorOf', () => {
  test('finds the last assistant message with usage', () => {
    const messages = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b', usage: { totalTokens: 100 } },
      { role: 'user', content: 'c' },
      { role: 'tool', content: 'd', usage: { totalTokens: 5 } },
      { role: 'assistant', content: 'e', usage: { inputTokens: 40, outputTokens: 10 } },
    ];
    expect(usageAnchorOf(messages)).toEqual({ index: 4, tokens: 50 });
  });

  test('ignores compaction summaries and messages without usage', () => {
    const messages = [
      { role: 'assistant', kind: 'compaction', content: 's', usage: { totalTokens: 9 } },
      { role: 'assistant', content: 'no usage here' },
      { role: 'user', content: 'x' },
    ];
    expect(usageAnchorOf(messages)).toBeUndefined();
  });

  test('ignores usage measured before the last compaction anchor', () => {
    const messages = [
      { role: 'assistant', content: 'pre', usage: { totalTokens: 400_000 } },
      { role: 'assistant', kind: 'compaction', content: 'summary' },
      { role: 'assistant', content: 'post', usage: { totalTokens: 50_000 } },
      { role: 'tool', content: 'x' },
    ];
    expect(usageAnchorOf(messages)).toEqual({ index: 2, tokens: 50_000 });
  });

  test('returns no anchor when only stale pre-compaction usage exists', () => {
    const messages = [
      { role: 'assistant', content: 'pre', usage: { totalTokens: 400_000 } },
      { role: 'assistant', kind: 'compaction', content: 'summary' },
      { role: 'tool', content: 'x' },
    ];
    expect(usageAnchorOf(messages)).toBeUndefined();
  });
});

describe('estimateTokensAnchored', () => {
  test('anchors on measured usage and estimates only the suffix', () => {
    const toolsJson = JSON.stringify([{ name: 'read_file', description: 'x'.repeat(400) }]);
    const tail = [{ role: 'user', content: 'b'.repeat(400) }];
    const messages = [
      { role: 'user', content: 'a'.repeat(100_000) },
      { role: 'assistant', content: 'done', usage: { totalTokens: 30_000 } },
      ...tail,
    ];
    const anchored = estimateTokensAnchored(messages, toolsJson);
    expect(anchored.messages).toBe(30_000 + Math.ceil(400 / 4));
    expect(anchored.tools).toBe(Math.ceil(toolsJson.length / 4));
    expect(anchored.total).toBe(anchored.messages + anchored.tools);
  });

  test('falls back to the plain estimate without an anchor', () => {
    const messages = [{ role: 'user', content: 'a'.repeat(400) }];
    expect(estimateTokensAnchored(messages)).toEqual(estimateTokens(messages));
  });

  test('falls back to the plain estimate when the anchor is the last message', () => {
    const messages = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b', usage: { totalTokens: 10 } },
    ];
    expect(estimateTokensAnchored(messages)).toEqual(estimateTokens(messages));
  });

  test('anchors on post-compaction usage instead of stale pre-compaction tokens', () => {
    const messages = [
      { role: 'assistant', content: 'pre', usage: { totalTokens: 400_000 } },
      { role: 'assistant', kind: 'compaction', content: 'summary' },
      { role: 'assistant', content: 'post', usage: { totalTokens: 50_000 } },
      { role: 'tool', content: 'x'.repeat(400) },
    ];
    const anchored = estimateTokensAnchored(messages);
    expect(anchored.messages).toBe(50_000 + 100);
    expect(anchored.messages).not.toBe(400_100);
  });

  test('falls back to the plain estimate when usage is stale behind compaction', () => {
    const messages = [
      { role: 'assistant', content: 'pre', usage: { totalTokens: 400_000 } },
      { role: 'assistant', kind: 'compaction', content: 'summary' },
      { role: 'tool', content: 'x'.repeat(400) },
    ];
    expect(estimateTokensAnchored(messages)).toEqual(estimateTokens(messages));
  });
});

describe('content-aware text estimate', () => {
  test('cyrillic text costs roughly one token per 2.5 chars', () => {
    const tokens = estimateMessageTokens({ role: 'user', content: 'а'.repeat(1000) });
    expect(tokens).toBeGreaterThanOrEqual(360);
    expect(tokens).toBeLessThanOrEqual(440);
  });

  test('latin text keeps the 4 chars-per-token rate', () => {
    expect(estimateMessageTokens({ role: 'user', content: 'a'.repeat(1000) })).toBe(250);
  });

  test('cjk text costs roughly one token per 1.2 chars', () => {
    const tokens = textTokensOf('あ'.repeat(1200));
    expect(tokens).toBeGreaterThanOrEqual(900);
    expect(tokens).toBeLessThanOrEqual(1100);
  });

  test('mixed scripts segment independently', () => {
    const text = `${'a'.repeat(400)}${'а'.repeat(1000)}${'あ'.repeat(120)}`;
    expect(textTokensOf(text)).toBe(100 + 400 + 100);
    expect(estimateMessageTokens({ role: 'user', content: text })).toBe(600);
  });

  test('json payload fields keep the latin rate regardless of content script', () => {
    const toolCalls = [{ id: 'c1', args: { blob: 'a'.repeat(1000) } }];
    const latin = estimateMessageTokens({
      role: 'assistant',
      content: 'a'.repeat(1000),
      toolCalls,
    });
    const cyrillic = estimateMessageTokens({
      role: 'assistant',
      content: 'а'.repeat(1000),
      toolCalls,
    });
    const jsonTokens = latin - 250;
    expect(cyrillic).toBe(400 + jsonTokens);
  });
});
