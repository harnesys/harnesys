import { describe, expect, test } from 'bun:test';
import { FAMILY_NAMES as SDK_FAMILY_NAMES } from '@harnesys/sdk';
import { FAMILY_NAMES } from './addons-platform.ts';

describe('FAMILY_NAMES', () => {
  test('has no duplicates', () => {
    expect(new Set(FAMILY_NAMES).size).toBe(FAMILY_NAMES.length);
  });

  test('matches the SDK family registry exactly', () => {
    const names: string[] = [...FAMILY_NAMES];
    const sdkNames: string[] = [...SDK_FAMILY_NAMES];
    expect(names.sort()).toEqual(sdkNames.sort());
  });
});
