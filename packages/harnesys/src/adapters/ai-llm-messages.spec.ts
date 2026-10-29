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
  'moonshotai',
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
