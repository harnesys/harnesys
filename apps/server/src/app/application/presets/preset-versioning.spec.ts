import { describe, expect, test } from 'bun:test';
import { PresetConflictException } from '../../domain/presets/preset.error.ts';
import { nextVersion } from './preset-versioning.ts';

describe('nextVersion', () => {
  test('creates a preset at 1.0.0', () => {
    expect(nextVersion(null)).toBe('1.0.0');
    expect(nextVersion(null, '2.3.4')).toBe('2.3.4');
  });

  test('patch bumps the current version', () => {
    expect(nextVersion('1.2.3')).toBe('1.2.4');
    expect(nextVersion('1.2.9')).toBe('1.2.10');
  });

  test('accepts an explicitly greater version', () => {
    expect(nextVersion('1.2.3', '1.3.0')).toBe('1.3.0');
    expect(nextVersion('1.2.3', '2.0.0')).toBe('2.0.0');
  });

  test('rejects an equal or lower version', () => {
    expect(() => nextVersion('1.2.3', '1.2.3')).toThrow(PresetConflictException);
    expect(() => nextVersion('1.2.3', '1.2.2')).toThrow(PresetConflictException);
    expect(() => nextVersion('1.2.3', '0.9.9')).toThrow(PresetConflictException);
  });
});
