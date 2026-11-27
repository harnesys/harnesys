import { describe, expect, test } from 'bun:test';
import { assertImageSizeSupported, supportedImageSizes } from './sdk-image.adapter.ts';

describe('supportedImageSizes', () => {
  test('pins the openai sdk driver sets and stays silent otherwise', () => {
    expect(supportedImageSizes('openai', 'gpt-image-1')).toEqual([
      '1024x1024',
      '1024x1536',
      '1536x1024',
      'auto',
    ]);
    expect(supportedImageSizes('openai', 'gpt-image-2')).toEqual([
      '1024x1024',
      '1024x1536',
      '1536x1024',
      'auto',
    ]);
    expect(supportedImageSizes('openai', 'dall-e-3')).toEqual([
      '1024x1024',
      '1024x1792',
      '1792x1024',
    ]);
    expect(supportedImageSizes('openai', 'gpt-4o')).toBeUndefined();
    expect(supportedImageSizes('openrouter', 'gpt-image-1')).toBeUndefined();
    expect(supportedImageSizes('together', 'flux-pro')).toBeUndefined();
  });
});

describe('assertImageSizeSupported', () => {
  test('rejects an unsupported size by enumerating the allowed ones', () => {
    expect(() => assertImageSizeSupported('openai', 'gpt-image-1', '512x512')).toThrow(
      'image model gpt-image-1 does not support size "512x512", supported sizes: 1024x1024 | 1024x1536 | 1536x1024 | auto',
    );
  });

  test('passes known sizes, unknown sizes when the set is not pinned, and no size', () => {
    expect(() => assertImageSizeSupported('openai', 'gpt-image-1', '1024x1536')).not.toThrow();
    expect(() => assertImageSizeSupported('openai', 'gpt-image-1', undefined)).not.toThrow();
    expect(() => assertImageSizeSupported('together', 'flux-pro', '512x512')).not.toThrow();
  });
});
