import { describe, expect, test } from 'bun:test';
import type { ReleaseInfo } from './server-update';
import { findRelease, isNewerVersion, parseVersion, releaseVersionFromTag } from './server-update';

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

describe('releaseVersionFromTag', () => {
  test('strips the v prefix', () => {
    expect(releaseVersionFromTag('v0.7.0')).toBe('0.7.0');
    expect(releaseVersionFromTag('0.7.0')).toBe('0.7.0');
  });
  test('null for non-release tags', () => {
    expect(releaseVersionFromTag('nightly')).toBeNull();
  });
});

describe('findRelease', () => {
  const releases: ReleaseInfo[] = [
    { version: '0.8.0', title: 'Next', notes: 'body-080', prerelease: false },
    { version: '0.7.0', title: 'Current', notes: 'body-070', prerelease: false },
  ];
  test('matches by normalized version', () => {
    expect(findRelease(releases, 'v0.7.0')?.notes).toBe('body-070');
    expect(findRelease(releases, '0.8.0')?.title).toBe('Next');
  });
  test('null when the version has no release', () => {
    expect(findRelease(releases, '0.9.9')).toBeNull();
  });
});
