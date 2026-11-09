import { describe, expect, test } from 'bun:test';
import {
  accountSecretKey,
  accountSecretPrefix,
  normalizeAccountScopes,
  scopeKeyOf,
  scopesCover,
} from './account.ts';

describe('account secret keys', () => {
  test('per-field keys hang off the account prefix', () => {
    expect(accountSecretPrefix('acc-1')).toBe('account:acc-1:');
    expect(accountSecretKey('acc-1', 'refreshToken')).toBe('account:acc-1:refreshToken');
    expect(accountSecretKey('acc-1', 'a').startsWith(accountSecretPrefix('acc-1'))).toBe(true);
    expect(accountSecretKey('acc-2', 'refreshToken')).not.toBe(
      accountSecretKey('acc-1', 'refreshToken'),
    );
  });
});

describe('normalizeAccountScopes', () => {
  test('trims, lowercases, dedupes and sorts', () => {
    expect(normalizeAccountScopes([' Mail.Read ', 'MAIL.READ', 'Files.Read'])).toEqual([
      'files.read',
      'mail.read',
    ]);
  });

  test('drops empty scopes', () => {
    expect(normalizeAccountScopes(['', '   '])).toEqual([]);
  });

  test('scope key is stable regardless of order and case', () => {
    expect(scopeKeyOf(['Mail.Read', 'Files.Read'])).toBe(scopeKeyOf(['files.read', 'mail.read']));
    expect(scopeKeyOf(['Mail.Read'])).not.toBe(scopeKeyOf(['Mail.Read', 'Files.Read']));
  });
});

describe('scopesCover', () => {
  test('an empty requirement is covered by any account', () => {
    expect(scopesCover(['mail.read'], [])).toBe(true);
    expect(scopesCover([], [])).toBe(true);
  });

  test('every required scope must be granted', () => {
    expect(scopesCover(['mail.read', 'files.read'], ['MAIL.READ', 'files.read'])).toBe(true);
    expect(scopesCover(['mail.read'], ['mail.read', 'files.read'])).toBe(false);
    expect(scopesCover([], ['mail.read'])).toBe(false);
  });

  test('a superset still covers', () => {
    expect(scopesCover(['a', 'b', 'c'], ['b'])).toBe(true);
  });
});
