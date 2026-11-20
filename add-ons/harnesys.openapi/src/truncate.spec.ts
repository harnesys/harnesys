import { describe, expect, test } from 'bun:test';
import { responsePayload, truncateText } from './truncate.ts';

describe('truncateText', () => {
  test('keeps short text untouched', () => {
    expect(truncateText('hello', 100)).toBe('hello');
  });

  test('truncates long text with a byte-accurate marker', () => {
    const text = 'x'.repeat(1000);
    const result = truncateText(text, 300);
    const match = /\[truncated: 1000 bytes total, showing first (\d+) bytes\]$/.exec(result);
    const shown = match === null ? 0 : Number(match[1]);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(1000);
    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(300);
  });

  test('does not cut multibyte characters in half', () => {
    const text = 'é'.repeat(500);
    const result = truncateText(text, 100);
    expect(result.startsWith('é')).toBe(true);
    expect(result).toContain('[truncated:');
  });
});

describe('responsePayload', () => {
  test('parses json bodies into objects', () => {
    const result = responsePayload('{"a":1}', 'application/json', 64 * 1024);
    expect(result.json).toEqual({ a: 1 });
    expect(result.text).toBeNull();
  });

  test('parses json-looking bodies without a content type', () => {
    const result = responsePayload('[1,2,3]', undefined, 64 * 1024);
    expect(result.json).toEqual([1, 2, 3]);
  });

  test('truncates oversized json as text', () => {
    const big = JSON.stringify({ a: 'x'.repeat(2000) });
    const result = responsePayload(big, 'application/json', 256);
    expect(result.json).toBeUndefined();
    expect(result.text).toContain('[truncated:');
  });

  test('returns plain text for non-json bodies', () => {
    const result = responsePayload('plain', 'text/plain', 1024);
    expect(result.json).toBeUndefined();
    expect(result.text).toBe('plain');
  });

  test('handles empty and null bodies', () => {
    expect(responsePayload(null, 'application/json', 1024)).toEqual({
      json: undefined,
      text: null,
    });
    expect(responsePayload('', 'application/json', 1024)).toEqual({ json: undefined, text: null });
  });
});
