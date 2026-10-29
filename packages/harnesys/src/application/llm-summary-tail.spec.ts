import { describe, expect, test } from 'bun:test';
import { buildRequestMessages } from './llm.ts';

const history = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: 'hi' },
];

describe('buildRequestMessages', () => {
  test('history without summary and notes stays as is', () => {
    expect(buildRequestMessages(history, '', '')).toEqual(history);
  });

  test('compaction summary goes to history tail as user message, not instructions', () => {
    const out = buildRequestMessages(history, 'Earlier the user asked about cats.', '');
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ role: 'user' });
    const text = (out[2] as { content: string }).content;
    expect(text).toContain('Earlier the user asked about cats.');
    expect(text).toContain('summary');
  });

  test('notes tail message comes after summary message', () => {
    const out = buildRequestMessages(history, 'summary text', 'note text');
    expect(out).toHaveLength(4);
    expect((out[2] as { content: string }).content).toContain('summary text');
    expect((out[3] as { content: string }).content).toBe('note text');
  });

  test('whitespace-only summary is dropped', () => {
    expect(buildRequestMessages(history, '   ', '')).toEqual(history);
  });

  test('history array is not mutated', () => {
    buildRequestMessages(history, 'summary', 'notes');
    expect(history).toHaveLength(2);
  });

  test('media inserts anchor after the whole tool block, keeping anchor order', () => {
    const block = [
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        toolCalls: [
          { id: 'x', name: 'read_image' },
          { id: 'y', name: 'list_dir' },
        ],
      },
      { role: 'tool', toolCallId: 'x', content: 'img' },
      { role: 'tool', toolCallId: 'y', content: 'items' },
    ];
    const inserts = [
      { afterToolCallId: 'x', message: { role: 'user', content: '[image from read_image]' } },
      { afterToolCallId: 'y', message: { role: 'user', content: '[image from list_dir]' } },
    ];
    const out = buildRequestMessages(block, '', '', inserts);
    expect(out.map((m) => (m as { role: string }).role)).toEqual([
      'user',
      'assistant',
      'tool',
      'tool',
      'user',
      'user',
    ]);
    expect(out[4]).toMatchObject({ content: '[image from read_image]' });
    expect(out[5]).toMatchObject({ content: '[image from list_dir]' });
  });
});
