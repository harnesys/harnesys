import { describe, expect, test } from 'bun:test';
import type { Contribution } from '@harnesys/sdk';
import { checkCompatibility, supportedPlatformMajors } from './compatibility.ts';

function contribution(id: string, family: string, optional?: boolean, v?: number): Contribution {
  return {
    id,
    family,
    descriptor: {},
    ...(optional === undefined ? {} : { optional }),
    ...(v === undefined ? {} : { v }),
  };
}

const knownFamilies: Record<string, readonly number[]> = {
  'tool-pack': [1],
  trigger: [1, 2],
};

const base = {
  platform: 1,
  supportedPlatforms: [1, 2],
  hostFeatures: ['family:source-kind@1', 'experimental.bridge'],
  knownFamilies,
};

describe('supportedPlatformMajors', () => {
  test('current and previous major are supported', () => {
    expect(supportedPlatformMajors(2)).toEqual([1, 2]);
    expect(supportedPlatformMajors(3, 0)).toEqual([3]);
    expect(supportedPlatformMajors(1)).toEqual([1]);
  });
});

describe('platform', () => {
  test('supported platform passes', () => {
    const result = checkCompatibility({ ...base, contributions: [] });
    expect(result.outcome).toBe('ok');
    expect(result.reasons).toEqual([]);
  });

  test('unsupported platform fails closed', () => {
    const result = checkCompatibility({ ...base, platform: 3, contributions: [] });
    expect(result.outcome).toBe('incompatible');
    expect(result.reasons).toContain('platform_unsupported:3');
  });
});

describe('features', () => {
  test('declared features present on host', () => {
    const result = checkCompatibility({
      ...base,
      features: ['family:source-kind@1'],
      contributions: [],
    });
    expect(result.outcome).toBe('ok');
  });

  test('missing feature is incompatible', () => {
    const result = checkCompatibility({
      ...base,
      features: ['family:source-kind@1', 'family:unknown@1'],
      contributions: [],
    });
    expect(result.outcome).toBe('incompatible');
    expect(result.reasons).toContain('feature_missing:family:unknown@1');
  });
});

describe('unknown families', () => {
  test('optional contribution is skipped with a warning', () => {
    const result = checkCompatibility({
      ...base,
      contributions: [contribution('extra', 'transport', true)],
    });
    expect(result.outcome).toBe('ok');
    expect(result.skipped).toEqual([
      { contributionId: 'extra', family: 'transport', reason: 'unknown_family' },
    ]);
  });

  test('required unknown family is incompatible', () => {
    const result = checkCompatibility({
      ...base,
      contributions: [contribution('extra', 'transport')],
    });
    expect(result.outcome).toBe('incompatible');
    expect(result.reasons).toContain('family_unknown:transport/extra');
  });
});

describe('descriptor versions', () => {
  test('known family with supported version passes', () => {
    const result = checkCompatibility({
      ...base,
      contributions: [contribution('t', 'trigger', undefined, 2)],
    });
    expect(result.outcome).toBe('ok');
  });

  test('unsupported version: optional skips, required fails', () => {
    const skipped = checkCompatibility({
      ...base,
      contributions: [contribution('t', 'trigger', true, 3)],
    });
    expect(skipped.outcome).toBe('ok');
    expect(skipped.skipped[0]?.reason).toBe('unsupported_descriptor_version');
    const failed = checkCompatibility({
      ...base,
      contributions: [contribution('t', 'trigger', false, 3)],
    });
    expect(failed.outcome).toBe('incompatible');
  });

  test('default descriptor version is 1', () => {
    const result = checkCompatibility({
      ...base,
      contributions: [contribution('p', 'tool-pack')],
    });
    expect(result.outcome).toBe('ok');
  });
});

describe('aggregation', () => {
  test('all reasons are reported at once', () => {
    const result = checkCompatibility({
      ...base,
      platform: 4,
      features: ['missing.thing'],
      contributions: [contribution('x', 'transport')],
    });
    expect(result.reasons).toHaveLength(3);
  });
});
