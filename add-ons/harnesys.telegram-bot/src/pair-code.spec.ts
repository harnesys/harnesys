import { describe, expect, test } from 'bun:test';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  createPairCode,
  hashPairCode,
  normalizeCode,
  pairCodeMatches,
} from './pair-code.ts';

describe('pair code', () => {
  test('generates codes from the legacy alphabet and length', () => {
    const { code, hash } = createPairCode();
    expect(code).toHaveLength(CODE_LENGTH);
    for (const char of code) {
      expect(CODE_ALPHABET).toContain(char);
    }
    expect(hash).toBe(hashPairCode(code));
  });

  test('matches the correct code before expiry', () => {
    const { code, hash, expiresAt } = createPairCode();
    expect(pairCodeMatches(code, hash, expiresAt, Date.now())).toBe(true);
  });

  test('rejects wrong, expired and empty codes', () => {
    const { code, hash, expiresAt } = createPairCode();
    expect(pairCodeMatches('AAAAAAAA', hash, expiresAt, Date.now())).toBe(false);
    expect(pairCodeMatches(code, hash, new Date(Date.now() - 1000).toISOString(), Date.now())).toBe(
      false,
    );
    expect(pairCodeMatches('', hash, expiresAt, Date.now())).toBe(false);
  });

  test('normalizes lowercase input', () => {
    expect(normalizeCode(' abcd2345 ')).toBe('ABCD2345');
  });
});
