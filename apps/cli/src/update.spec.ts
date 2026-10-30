import { describe, expect, test } from 'bun:test';
import { assetNameFor, isNewerVersion, parseVersion } from './update.ts';

describe('assetNameFor', () => {
  test('includes platform and arch on supported platforms', () => {
    // The slug depends on the host running the test; assert the shape only.
    const name = assetNameFor('harnesys-host');
    expect(name.startsWith('harnesys-host-')).toBe(true);
    expect(name).not.toContain('unknown');
  });
});

describe('parseVersion', () => {
  test('accepts v-prefixed and bare triples', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.10.1')).toEqual([0, 10, 1]);
  });
  test('rejects non-semver tags', () => {
    expect(parseVersion('nightly')).toBeNull();
    expect(parseVersion('v1.2')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  test('major/minor/patch ordering', () => {
    expect(isNewerVersion('0.7.0', '0.8.0')).toBe(true);
    expect(isNewerVersion('0.7.0', '0.7.1')).toBe(true);
    expect(isNewerVersion('0.7.0', '1.0.0')).toBe(true);
  });
  test('same or older versions are not newer', () => {
    expect(isNewerVersion('0.7.0', '0.7.0')).toBe(false);
    expect(isNewerVersion('0.7.0', '0.6.9')).toBe(false);
  });
  test('unparsable tags never trigger an update', () => {
    expect(isNewerVersion('0.7.0', 'nightly')).toBe(false);
    expect(isNewerVersion('dev', '0.7.0')).toBe(false);
  });
});
