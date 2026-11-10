import { describe, expect, test } from 'bun:test';
import { resolveL10n } from './resolve-l10n.ts';

describe('resolveL10n', () => {
  test('passes a plain string through', () => {
    expect(resolveL10n('Hello', 'en')).toBe('Hello');
  });

  test('picks the requested locale from a record', () => {
    expect(resolveL10n({ en: 'Hello', de: 'Hallo' }, 'de')).toBe('Hallo');
  });

  test('falls back to en when the locale is missing', () => {
    expect(resolveL10n({ en: 'Hello' }, 'fr')).toBe('Hello');
  });

  test('returns an empty string for a missing record entry', () => {
    expect(resolveL10n({}, 'fr')).toBe('');
  });

  test('resolves %key% references from the locale bundle', () => {
    expect(resolveL10n('Added %count% rows', 'en', { en: { count: '3' } })).toBe('Added 3 rows');
  });

  test('resolves references from the en bundle as fallback', () => {
    expect(resolveL10n('Added %count% rows', 'de', { en: { count: '3' } })).toBe('Added 3 rows');
  });

  test('leaves unresolved references as literal tokens', () => {
    expect(resolveL10n('Added %missing% rows', 'en', { en: {} })).toBe('Added %missing% rows');
  });

  test('resolves references without bundles only as literals', () => {
    expect(resolveL10n('Added %count% rows', 'en')).toBe('Added %count% rows');
  });

  test('resolves references inside a locale record value', () => {
    expect(
      resolveL10n({ en: 'Hi %name%', de: 'Hallo %name%' }, 'de', { de: { name: 'Max' } }),
    ).toBe('Hallo Max');
  });
});
