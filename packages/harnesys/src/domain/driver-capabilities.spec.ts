import { describe, expect, test } from 'bun:test';
import { driverMechanism, resolveApiBaseUrl } from './driver-capabilities.ts';

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
