import { describe, expect, test } from 'bun:test';
import { toModelMessages } from './ai-llm-messages.ts';

const CAPTION = '[image from file_read_image (call t1) thread:attachments/a/pic.png]';
const history = [
  { role: 'user', content: 'look at this' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [{ id: 't1', name: 'file_read_image' }],
  },
  { role: 'tool', toolCallId: 't1', name: 'file_read_image', content: '{"ok":true}' },
  {
    role: 'user',
    content: [
      { type: 'text', text: CAPTION },
      { type: 'file', mediaType: 'image/png', data: 'aGVsbG8=' },
    ],
  },
];

const PROVIDER_CLASSES = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openai-compatible',
  'mistral',
  'xai',
  'alibaba',
  'kimi',
] as const;

describe('media insert wire shapes', () => {
  for (const driver of PROVIDER_CLASSES) {
    test(`wire shape for ${driver}`, () => {
      expect({ driver, messages: toModelMessages(history) }).toMatchSnapshot(
        `${driver} wire shape`,
      );
    });
  }
});

describe('reasoningKeepRounds', () => {
  const reasoningHistory = (): unknown[] => [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'a1', reasoning: 'R1', toolCalls: [] },
    { role: 'tool', content: 't1' },
    { role: 'user', content: 'second' },
    { role: 'assistant', content: 'a2', reasoning: 'R2', toolCalls: [] },
    { role: 'assistant', content: 'a3', reasoning: 'R3', toolCalls: [] },
  ];
  test('keeps all reasoning by default', () => {
    const messages = toModelMessages(reasoningHistory()) as { content: unknown }[];
    expect(JSON.stringify(messages)).toContain('R1');
    expect(JSON.stringify(messages)).toContain('R3');
  });

  test('keeps only the last N reasoning rounds', () => {
    const messages = toModelMessages(reasoningHistory(), { reasoningKeepRounds: 2 }) as Record<
      string,
      unknown
    >[];
    expect(JSON.stringify(messages)).not.toContain('R1');
    expect(JSON.stringify(messages)).toContain('R2');
    expect(JSON.stringify(messages)).toContain('R3');
  });

  test('older assistant text survives the reasoning cutoff', () => {
    const messages = toModelMessages(reasoningHistory(), { reasoningKeepRounds: 1 }) as Record<
      string,
      unknown
    >[];
    expect(JSON.stringify(messages)).not.toContain('R2');
    expect(JSON.stringify(messages)).toContain('R3');
    expect(JSON.stringify(messages)).toContain('a2');
  });

  test('zero strips every reasoning part but keeps assistant text', () => {
    const messages = toModelMessages(reasoningHistory(), { reasoningKeepRounds: 0 }) as Record<
      string,
      unknown
    >[];
    expect(JSON.stringify(messages)).not.toContain('R1');
    expect(JSON.stringify(messages)).not.toContain('R3');
    expect(JSON.stringify(messages)).toContain('a1');
    expect(JSON.stringify(messages)).toContain('a3');
  });

  test('a window wider than the history keeps everything', () => {
    const messages = toModelMessages(reasoningHistory(), { reasoningKeepRounds: 99 });
    expect(JSON.stringify(messages)).toContain('R1');
  });
});
