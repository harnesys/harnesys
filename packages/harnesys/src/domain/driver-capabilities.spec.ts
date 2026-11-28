import { describe, expect, test } from 'bun:test';
import { driverMechanism, imageCapabilities, resolveApiBaseUrl } from './driver-capabilities.ts';

describe('driver capabilities', () => {
  test('sdk and oai cells resolve their mechanism', () => {
    expect(driverMechanism('openai', 'image')).toBe('sdk');
    expect(driverMechanism('openai-compatible', 'image')).toBe('oai');
    expect(driverMechanism('openrouter', 'speech')).toBe('oai');
    expect(driverMechanism('openrouter', 'transcription')).toBe('oai');
    expect(driverMechanism('openrouter', 'image')).toBe('oai');
    expect(driverMechanism('groq', 'speech')).toBe('oai');
    expect(driverMechanism('mistral', 'speech')).toBe('mistral');
    expect(driverMechanism('mistral', 'transcription')).toBe('oai');
  });

  test('incapable drivers resolve to none', () => {
    expect(driverMechanism('anthropic', 'image')).toBe('none');
    expect(driverMechanism('mistral', 'image')).toBe('none');
    expect(driverMechanism('google', 'image')).toBe('none');
  });

  test('dashscope image mechanism carries negativePrompt and seed, no pinned sizes', () => {
    expect(driverMechanism('alibaba', 'image')).toBe('dashscope');
    expect(imageCapabilities('alibaba', 'qwen-image-3.0-pro')).toEqual({
      sizes: [],
      negativePrompt: true,
      seed: true,
    });
  });

  test('image capabilities do not leak provider quirks across mechanisms', () => {
    expect(imageCapabilities('openai', 'gpt-image-1')).toEqual({
      sizes: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
      negativePrompt: false,
      seed: false,
    });
    expect(imageCapabilities('openrouter', 'flux-pro')).toEqual({
      sizes: [],
      negativePrompt: false,
      seed: false,
    });
  });

  test('unknown driver resolves to none', () => {
    expect(driverMechanism('nonexistent', 'image')).toBe('none');
  });

  test('api base url prefers explicit apiUrl, falls back to driver default', () => {
    expect(resolveApiBaseUrl('openrouter', 'https://custom.example/v1')).toBe(
      'https://custom.example/v1',
    );
    expect(resolveApiBaseUrl('openrouter', undefined)).toBe('https://openrouter.ai/api/v1');
    expect(resolveApiBaseUrl('openrouter', '')).toBe('https://openrouter.ai/api/v1');
    expect(resolveApiBaseUrl('groq', undefined)).toBe('https://api.groq.com/openai/v1');
    expect(resolveApiBaseUrl('mistral', undefined)).toBe('https://api.mistral.ai/v1');
    expect(resolveApiBaseUrl('openai', undefined)).toBeUndefined();
    expect(resolveApiBaseUrl('nonexistent', undefined)).toBeUndefined();
  });
});
