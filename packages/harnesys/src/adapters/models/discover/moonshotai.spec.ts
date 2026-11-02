import { describe, expect, test } from 'bun:test';
import { parseMoonshotAIList } from './moonshotai.ts';

const CATALOG = {
  data: [
    { id: 'moonshot-v1-8k', context_length: 8192, supports_reasoning: true },
    {
      id: 'moonshot-v1-32k-vision',
      context_length: 32768,
      supports_image_in: true,
    },
    { id: 'moonshot-embed', context_length: 8192 },
  ],
};

describe('parseMoonshotAIList', () => {
  test('maps text-only chat models to text input and output', () => {
    const model = parseMoonshotAIList(CATALOG).find((item) => item.name === 'moonshot-v1-8k');
    expect(model?.architecture).toEqual({
      input_modalities: ['text'],
      output_modalities: ['text'],
    });
  });

  test('maps the image input flag', () => {
    const model = parseMoonshotAIList(CATALOG).find(
      (item) => item.name === 'moonshot-v1-32k-vision',
    );
    expect(model?.architecture).toEqual({
      input_modalities: ['text', 'image'],
      output_modalities: ['text'],
    });
  });

  test('drops architecture for embed models', () => {
    const model = parseMoonshotAIList(CATALOG).find((item) => item.name === 'moonshot-embed');
    expect(model?.kind).toBe('embed');
    expect(model?.architecture).toBeUndefined();
  });
});
