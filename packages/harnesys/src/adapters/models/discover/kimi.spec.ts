import { describe, expect, test } from 'bun:test';
import { parseKimiList } from './kimi.ts';

const CATALOG = {
  data: [
    { id: 'kimi-k3', context_length: 262144, supports_reasoning: true },
    {
      id: 'kimi-k3-vision',
      context_length: 262144,
      supports_image_in: true,
      supports_video_in: true,
    },
    { id: 'kimi-embed', context_length: 8192 },
  ],
};

describe('parseKimiList', () => {
  test('maps text-only chat models to text input and output', () => {
    const model = parseKimiList(CATALOG).find((item) => item.name === 'kimi-k3');
    expect(model?.architecture).toEqual({
      input_modalities: ['text'],
      output_modalities: ['text'],
    });
  });

  test('maps image and video input flags', () => {
    const model = parseKimiList(CATALOG).find((item) => item.name === 'kimi-k3-vision');
    expect(model?.architecture).toEqual({
      input_modalities: ['text', 'image', 'video'],
      output_modalities: ['text'],
    });
  });

  test('drops architecture for embed models', () => {
    const model = parseKimiList(CATALOG).find((item) => item.name === 'kimi-embed');
    expect(model?.kind).toBe('embed');
    expect(model?.architecture).toBeUndefined();
  });
});
