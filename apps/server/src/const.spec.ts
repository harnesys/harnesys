import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BUNDLED_ADDONS_ENV,
  BUNDLED_ASSETS_ENV,
  bundledAddonsRoot,
  SOURCE_ADDONS_DIR,
} from './const.ts';

const originalAddons = process.env[BUNDLED_ADDONS_ENV];
const originalAssets = process.env[BUNDLED_ASSETS_ENV];
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bundled-addons-'));
  tempDirs.push(dir);
  return dir;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnv(BUNDLED_ADDONS_ENV, originalAddons);
  restoreEnv(BUNDLED_ASSETS_ENV, originalAssets);
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('bundledAddonsRoot', () => {
  test('HARNESYS_ADDONS_DIR override wins over the packaged assets directory', () => {
    const assets = tempDir();
    mkdirSync(join(assets, 'add-ons'), { recursive: true });
    process.env[BUNDLED_ASSETS_ENV] = assets;
    const override = join(tempDir(), 'custom-addons');
    process.env[BUNDLED_ADDONS_ENV] = override;
    expect(bundledAddonsRoot()).toBe(resolve(override));
  });

  test('resolves <bundledAssetsRoot()>/add-ons when it exists', () => {
    delete process.env[BUNDLED_ADDONS_ENV];
    const assets = tempDir();
    const vendored = join(assets, 'add-ons');
    mkdirSync(vendored, { recursive: true });
    process.env[BUNDLED_ASSETS_ENV] = assets;
    expect(bundledAddonsRoot()).toBe(vendored);
  });

  test('falls back to the repository add-ons directory', () => {
    delete process.env[BUNDLED_ADDONS_ENV];
    process.env[BUNDLED_ASSETS_ENV] = tempDir();
    expect(bundledAddonsRoot()).toBe(SOURCE_ADDONS_DIR);
  });
});
