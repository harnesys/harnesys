import { describe, expect, test } from 'bun:test';
import { isSearchableQuery } from './searchable-query';

describe('isSearchableQuery', () => {
  test('blank queries are not searchable, non-blank are', () => {
    expect(isSearchableQuery('')).toBe(false);
    expect(isSearchableQuery('   ')).toBe(false);
    expect(isSearchableQuery('auth flow')).toBe(true);
    expect(isSearchableQuery('  x')).toBe(true);
  });
});
