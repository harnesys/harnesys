import { describe, expect, test } from 'bun:test';
import { parseMistralList } from './mistral.ts';

const CATALOG = {
  data: [
    { id: 'voxtral-mini-tts-3-0', max_context_length: 32768 },
    { id: 'voxtral-mini-transcribe-3-0', max_context_length: 32768 },
    { id: 'voxtral-mini-transcribe-realtime-3-0' },
    { id: 'voxtral-small-transcribe-3-0' },
    { id: 'mistral-embed-2312' },
    { id: 'codestral-embed-2505' },
    { id: 'mistral-small-latest', capabilities: { completion_chat: true } },
    { id: 'voxtral-small-latest', capabilities: { completion_chat: true } },
    {
      id: 'mistral-moderation-2603',
      capabilities: { completion_chat: false },
    },
  ],
};

describe('parseMistralList', () => {
  test('derives speech and transcription kinds from voxtral families', () => {
    const models = parseMistralList(CATALOG);
    const kindOf = (name: string) => models.find((model) => model.name === name)?.kind;
    expect(kindOf('voxtral-mini-tts-3-0')).toBe('speech');
    expect(kindOf('voxtral-mini-transcribe-3-0')).toBe('transcription');
    expect(kindOf('voxtral-mini-transcribe-realtime-3-0')).toBe('transcription');
    expect(kindOf('voxtral-small-transcribe-3-0')).toBe('transcription');
  });

  test('derives embed kind from model name', () => {
    const models = parseMistralList(CATALOG);
    const kindOf = (name: string) => models.find((model) => model.name === name)?.kind;
    expect(kindOf('mistral-embed-2312')).toBe('embed');
    expect(kindOf('codestral-embed-2505')).toBe('embed');
  });

  test('keeps audio-in chat models and defaults to chat', () => {
    const models = parseMistralList(CATALOG);
    const kindOf = (name: string) => models.find((model) => model.name === name)?.kind;
    expect(kindOf('voxtral-small-latest')).toBe('chat');
    expect(kindOf('mistral-small-latest')).toBe('chat');
  });

  test('marks moderation models without a kind', () => {
    const models = parseMistralList(CATALOG);
    expect(models.find((model) => model.name === 'mistral-moderation-2603')?.kind).toBeUndefined();
  });
});
