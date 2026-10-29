import { describe, expect, test } from 'bun:test';
import {
  isSystemSecretKey,
  isValidVaultName,
  parseVaultRef,
  parseVaultStorageKey,
  secretRef,
  slugVaultName,
  vaultStorageKey,
} from './vault-keys.ts';

describe('vault-keys', () => {
  test('storage keys and parse roundtrip', () => {
    expect(vaultStorageKey('secret', 'OPENAI')).toBe('secret:OPENAI');
    expect(vaultStorageKey('variable', 'BASE_URL')).toBe('var:BASE_URL');
    expect(parseVaultStorageKey('secret:OPENAI')).toEqual({ kind: 'secret', name: 'OPENAI' });
    expect(parseVaultStorageKey('var:BASE_URL')).toEqual({ kind: 'variable', name: 'BASE_URL' });
    expect(parseVaultStorageKey('cloud:google:x')).toBeNull();
    expect(parseVaultRef('secret:OPENAI')).toEqual({ kind: 'secret', name: 'OPENAI' });
    expect(secretRef('OPENAI')).toBe('secret:OPENAI');
  });

  test('name validation and slug', () => {
    expect(isValidVaultName('OPENAI_API_KEY')).toBe(true);
    expect(isValidVaultName('1bad')).toBe(false);
    expect(isValidVaultName('has space')).toBe(false);
    expect(slugVaultName('My Provider!', 'abcd1234')).toBe('My-Provider');
    expect(slugVaultName('!!!', 'abcd1234').startsWith('p-')).toBe(true);
  });

  test('system keys stay out of vault UI', () => {
    expect(isSystemSecretKey('cloud:google:cred')).toBe(true);
    expect(isSystemSecretKey('llm_provider:uuid')).toBe(true);
    expect(isSystemSecretKey('secret:OPENAI')).toBe(false);
  });
});
