import { describe, expect, test } from 'bun:test';
import { decideMaterializationRevision } from './source-materialization.port.ts';

describe('decideMaterializationRevision', () => {
  test('applies first revision', () => {
    expect(decideMaterializationRevision(null, 1)).toBe('applied');
  });

  test('applies newer revision', () => {
    expect(decideMaterializationRevision(1, 2)).toBe('applied');
  });

  test('idempotent on same revision', () => {
    expect(decideMaterializationRevision(3, 3)).toBe('idempotent');
  });

  test('ignores older revision', () => {
    expect(decideMaterializationRevision(5, 2)).toBe('ignored');
  });
});
