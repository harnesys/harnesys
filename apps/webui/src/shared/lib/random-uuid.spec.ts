import { describe, expect, test } from 'bun:test';
import { randomUUID } from './random-uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('randomUUID', () => {
  test('returns rfc4122 v4 string', () => {
    expect(randomUUID()).toMatch(UUID_V4);
  });

  test('falls back when randomUUID is missing', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    try {
      expect(randomUUID()).toMatch(UUID_V4);
    } finally {
      if (original) {
        Object.defineProperty(globalThis.crypto, 'randomUUID', original);
      } else {
        Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
      }
    }
  });
});
