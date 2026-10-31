import { describe, expect, test } from 'bun:test';
import { estimateTokens, estimateTokensAnchored, usageAnchorOf } from './estimate.ts';

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
});
