import { describe, expect, test } from 'bun:test';
import type { ImageParameterCapabilities } from 'harnesys';
import { assertImageInputSupported } from './image.port.ts';

const PINNED: ImageParameterCapabilities = {
  sizes: ['1024x1024', 'auto'],
  negativePrompt: false,
  seed: false,
};

const DASHSCOPE: ImageParameterCapabilities = {
  sizes: [],
  negativePrompt: true,
  seed: true,
};

describe('assertImageInputSupported', () => {
  test('rejects sizes outside a pinned set and stays silent for free-form sizes', () => {
    expect(() =>
      assertImageInputSupported('gpt-image-1', PINNED, { prompt: 'p', size: '512x512' }),
    ).toThrow(
      'image model gpt-image-1 does not support size "512x512", supported sizes: 1024x1024 | auto',
    );
    expect(() =>
      assertImageInputSupported('gpt-image-1', PINNED, { prompt: 'p', size: 'auto' }),
    ).not.toThrow();
    expect(() =>
      assertImageInputSupported('flux', DASHSCOPE, { prompt: 'p', size: '512x512' }),
    ).not.toThrow();
  });

  test('rejects provider parameters the mechanism does not carry', () => {
    expect(() =>
      assertImageInputSupported('gpt-image-1', PINNED, { prompt: 'p', negativePrompt: 'blurry' }),
    ).toThrow('image model gpt-image-1 does not support negativePrompt');
    expect(() =>
      assertImageInputSupported('gpt-image-1', PINNED, { prompt: 'p', seed: 7 }),
    ).toThrow('image model gpt-image-1 does not support seed');
    expect(() =>
      assertImageInputSupported('qwen-image-3.0-pro', DASHSCOPE, {
        prompt: 'p',
        negativePrompt: 'blurry',
        seed: 7,
      }),
    ).not.toThrow();
  });
});
