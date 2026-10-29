import { describe, expect, test } from 'bun:test';
import { parseOpenRouterList } from './openrouter.ts';

const CATALOG = {
  data: [
    {
      id: 'anthropic/claude-haiku-5.5',
      context_length: 200000,
      pricing: {
        prompt: '0.000001',
        completion: '0.000005',
        input_cache_read: '0.0000001',
        input_cache_write: '0.00000125',
        image: '0.003',
        request: '0.01',
        overrides: [
          {
            min_prompt_tokens: 100000,
            prompt: '0.000002',
            completion: '0.00001',
            input_cache_read: '0.0000002',
            input_cache_write: '0.0000025',
          },
        ],
      },
    },
  ],
};

describe('parseOpenRouterList', () => {
  test('keeps image, request and threshold overrides in pricing', () => {
    const [model] = parseOpenRouterList(CATALOG);
    expect(model?.pricing).toEqual({
      prompt: '0.000001',
      completion: '0.000005',
      input_cache_read: '0.0000001',
      input_cache_write: '0.00000125',
      image: '0.003',
      request: '0.01',
      overrides: [
        {
          minPromptTokens: 100000,
          prompt: '0.000002',
          completion: '0.00001',
          input_cache_read: '0.0000002',
          input_cache_write: '0.0000025',
        },
      ],
    });
  });

  test('drops overrides without a token threshold', () => {
    const [model] = parseOpenRouterList({
      data: [
        {
          id: 'vendor/model',
          pricing: {
            prompt: '0.000001',
            completion: '0.000002',
            overrides: [{ prompt: '0.000003' }],
          },
        },
      ],
    });
    expect(model?.pricing?.overrides).toBeUndefined();
  });

  test('derives embed kind from output_modalities', () => {
    const [model] = parseOpenRouterList({
      data: [
        {
          id: 'nvidia/nemotron-3.5-embed-1b:free',
          architecture: {
            modality: 'text+image->embeddings',
            input_modalities: ['text', 'image'],
            output_modalities: ['embeddings'],
          },
        },
      ],
    });
    expect(model?.kind).toBe('embed');
  });

  test('derives decision kind from output_modalities', () => {
    const [model] = parseOpenRouterList({
      data: [
        {
          id: 'inception/mercury-decide:free',
          architecture: {
            modality: 'text+image->decisions',
            output_modalities: ['decisions'],
          },
        },
      ],
    });
    expect(model?.kind).toBe('decision');
  });

  test('derives image and audio kinds from output_modalities', () => {
    const models = parseOpenRouterList({
      data: [
        {
          id: 'vendor/image-model',
          architecture: { output_modalities: ['text', 'image'] },
        },
        {
          id: 'vendor/audio-model',
          architecture: { output_modalities: ['audio'] },
        },
      ],
    });
    expect(models.map((model) => model.kind)).toEqual(['image', 'audio']);
  });

  test('derives rerank, speech, transcription and video kinds from output_modalities', () => {
    const models = parseOpenRouterList({
      data: [
        {
          id: 'vendor/rerank-model',
          architecture: { output_modalities: ['rerank'] },
        },
        {
          id: 'vendor/speech-model',
          architecture: { output_modalities: ['speech'] },
        },
        {
          id: 'vendor/transcription-model',
          architecture: { output_modalities: ['transcription'] },
        },
        {
          id: 'vendor/video-model',
          architecture: { output_modalities: ['video'] },
        },
      ],
    });
    expect(models.map((model) => model.kind)).toEqual([
      'rerank',
      'speech',
      'transcription',
      'video',
    ]);
  });

  test('keeps special kinds ahead of media kinds for mixed modalities', () => {
    const models = parseOpenRouterList({
      data: [
        {
          id: 'vendor/embed-with-text',
          architecture: { output_modalities: ['embeddings', 'text'] },
        },
        {
          id: 'vendor/decision-with-video',
          architecture: { output_modalities: ['decisions', 'video'] },
        },
        {
          id: 'vendor/speech-with-audio',
          architecture: { output_modalities: ['audio', 'speech'] },
        },
      ],
    });
    expect(models.map((model) => model.kind)).toEqual(['embed', 'decision', 'audio']);
  });

  test('defaults to chat kind without output_modalities', () => {
    const [model] = parseOpenRouterList({
      data: [{ id: 'inception/mercury-3' }],
    });
    expect(model?.kind).toBe('chat');
  });
});
