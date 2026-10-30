import { describe, expect, test } from 'bun:test';
import { isNewerVersion, parseVersion } from './server-update';

describe('parseVersion', () => {
  test('accepts v-prefixed and bare triples', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.10.1')).toEqual([0, 10, 1]);
  });
  test('rejects non-semver tags', () => {
    expect(parseVersion('nightly')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  test('major/minor/patch ordering', () => {
    expect(isNewerVersion('0.7.0', '0.8.0')).toBe(true);
    expect(isNewerVersion('0.7.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('0.7.0', '0.7.1')).toBe(true);
  });
  test('same or older versions are not newer', () => {
    expect(isNewerVersion('0.7.0', '0.7.0')).toBe(false);
    expect(isNewerVersion('0.7.0', '0.6.9')).toBe(false);
  });
  test('unparsable versions never trigger a banner', () => {
    expect(isNewerVersion('0.7.0', 'dev')).toBe(false);
    expect(isNewerVersion('unknown', '0.8.0')).toBe(false);
  });
});
