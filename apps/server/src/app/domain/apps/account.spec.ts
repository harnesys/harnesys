import { describe, expect, it } from 'bun:test';
import { normalizeAccountScopes, scopeKeyOf } from './account.ts';

describe('scopeKeyOf', () => {
  it('is stable regardless of order and case', () => {
    expect(scopeKeyOf(['A', 'b'])).toBe(scopeKeyOf(['b', ' a ']));
  });

  it('separates different scope sets', () => {
    expect(scopeKeyOf(['a'])).not.toBe(scopeKeyOf(['a', 'b']));
  });
});

describe('normalizeAccountScopes', () => {
  it('trims, lowercases, dedupes and sorts', () => {
    expect(normalizeAccountScopes(['a', 'A', ' b '])).toEqual(['a', 'b']);
  });
});
