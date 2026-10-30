import { describe, expect, test } from 'bun:test';
import { assetNameFor, checksumHexFor, isNewerVersion, parseVersion, sha256Hex } from './update.ts';

describe('assetNameFor', () => {
  test('includes platform and arch on supported platforms', () => {
    // The slug depends on the host running the test; assert the shape only.
    const name = assetNameFor('harnesys-host');
    expect(name.startsWith('harnesys-host-')).toBe(true);
    expect(name).not.toContain('unknown');
  });
});

describe('sha256Hex', () => {
  test('known vector', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('checksumHexFor', () => {
  const sums = 'aaa111  harnesys-host-linux-x64\nbbb222  harnesys-web-linux-x64\n';
  test('picks the row for the asset', () => {
    expect(checksumHexFor(sums, 'harnesys-host-linux-x64')).toBe('aaa111');
  });
  test('null when asset missing', () => {
    expect(checksumHexFor(sums, 'harnesys-host-darwin-arm64')).toBeNull();
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
