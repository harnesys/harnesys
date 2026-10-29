import { describe, expect, test } from 'bun:test';
import { packsShapeError, packValueIssues } from './pack.ts';

describe('packValueIssues', () => {
  test('accepts booleans', () => {
    expect(packValueIssues(true)).toEqual([]);
    expect(packValueIssues(false)).toEqual([]);
  });

  test('rejects null unless null is allowed', () => {
    expect(packValueIssues(null)[0]?.code).toBe('packs_value');
    expect(packValueIssues(null, { allowNull: true })).toEqual([]);
  });

  test('rejects non-object values', () => {
    expect(packValueIssues('core')[0]).toEqual({
      code: 'packs_value',
      field: '',
      requirement: 'must be true, false, or { spec?, disabledTools?, exposure? }',
    });
  });

  test('rejects unknown override keys', () => {
    expect(packValueIssues({ nope: 1 })[0]?.requirement).toBe(
      'may only have "spec", "disabledTools", or "exposure" properties',
    );
  });

  test('checks spec, disabledTools and exposure separately', () => {
    expect(packValueIssues({ spec: 1 })[0]).toEqual({
      code: 'packs_spec',
      field: 'spec',
      requirement: 'must be an object',
    });
    expect(packValueIssues({ disabledTools: [1] })[0]).toEqual({
      code: 'packs_disabled_tools',
      field: 'disabledTools',
      requirement: 'must be an array of strings',
    });
    expect(packValueIssues({ exposure: { fs: 'weird' } })[0]).toEqual({
      code: 'packs_exposure',
      field: 'exposure',
      requirement: 'must be an object of tool name to "direct" | "deferred"',
    });
  });

  test('accepts a valid override', () => {
    expect(
      packValueIssues({
        spec: { a: 1 },
        disabledTools: ['fs.read'],
        exposure: { 'fs.read': 'deferred' },
      }),
    ).toEqual([]);
  });
});

describe('packsShapeError', () => {
  test('returns null for a valid map', () => {
    expect(packsShapeError({ core: true, plan: { spec: {} }, memory: null })).toBeNull();
  });

  test('reports a non-object map', () => {
    expect(packsShapeError([])).toBe('packs must be an object');
    expect(packsShapeError('core')).toBe('packs must be an object');
  });

  test('points at the offending pack', () => {
    expect(packsShapeError({ core: true, plan: { spec: 1 } })).toBe(
      'packs.plan.spec must be an object',
    );
    expect(packsShapeError({ plan: { nope: 1 } })).toBe(
      'packs.plan may only have "spec", "disabledTools", or "exposure" properties',
    );
    expect(packsShapeError({ plan: 'core' })).toBe(
      'packs.plan must be true, false, null, or { spec?, disabledTools?, exposure? }',
    );
  });

  test('allows null pack values', () => {
    expect(packsShapeError({ plan: null })).toBeNull();
  });
});
