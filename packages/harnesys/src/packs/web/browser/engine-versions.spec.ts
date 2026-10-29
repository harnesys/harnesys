import { describe, expect, test } from 'bun:test';
import { engineSpecOf } from './engine-catalog.ts';
import { compareVersions } from './engine-fs.ts';
import { cftVersionOptions, githubReleaseOptions } from './engine-versions.ts';

describe('engine version registry', () => {
  test('chrome-for-testing options are newest-first with pinned hash on recommended', () => {
    const spec = engineSpecOf('chromium');
    if (spec === undefined) {
      throw new Error('chromium spec missing');
    }
    const raw = {
      versions: [
        { version: '100.0.0.0' },
        { version: '129.0.6668.100' },
        { version: spec.version },
      ],
    };
    const options = cftVersionOptions(raw, spec, 'linux-x86_64');
    expect(options[0]?.version).toBe(spec.version);
    expect(options[1]?.version).toBe('129.0.6668.100');
    expect(options[0]?.supported).toBe(true);
    expect(options[0]?.url).toContain(`/${spec.version}/linux64/chrome-linux64.zip`);
    const arm = cftVersionOptions(raw, spec, 'linux-aarch64');
    expect(arm.every((option) => !option.supported)).toBe(true);
    const recommended = options.find((option) => option.recommended);
    expect(recommended?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(recommended?.supported).toBe(true);
    const old = options.find((option) => option.version === '129.0.6668.100');
    expect(old?.sha256).toBeNull();
  });

  test('github release options strip tag prefix and match platform assets', () => {
    const spec = engineSpecOf('obscura');
    if (spec === undefined) {
      throw new Error('obscura spec missing');
    }
    const raw = [
      {
        tag_name: 'v0.2.4',
        assets: [
          {
            name: 'obscura-x86_64-linux.tar.gz',
            browser_download_url: 'https://gh/v0.2.4/x86.tar.gz',
          },
          {
            name: 'obscura-aarch64-macos.tar.gz',
            browser_download_url: 'https://gh/v0.2.4/arm.tar.gz',
          },
        ],
      },
      {
        tag_name: 'v0.2.3',
        assets: [{ name: 'source.zip', browser_download_url: 'https://gh/src.zip' }],
      },
      { tag_name: 'v0.2.2', prerelease: true, assets: [] },
    ];
    const options = githubReleaseOptions(raw, spec, 'linux-x86_64');
    expect(options.map((option) => option.version)).toEqual(['0.2.4', '0.2.3']);
    expect(options[0]?.supported).toBe(true);
    expect(options[0]?.recommended).toBe(true);
    expect(options[1]?.supported).toBe(false);
  });
});

describe('compareVersions', () => {
  test('numeric-aware ordering', () => {
    expect(compareVersions('156.0.8078.47', '129.0.6668.100')).toBe(1);
    expect(compareVersions('0.2.10', '0.2.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(-1);
    expect(compareVersions('0.2.4', '0.2.4')).toBe(0);
  });
});
