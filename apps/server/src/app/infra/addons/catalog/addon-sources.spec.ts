import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addonStagingDir } from './addon-paths.ts';
import { BuiltinAddonSourceAdapter, releaseStaging, stageAddonDirectory } from './addon-staging.ts';
import { ExternalAddonSourceAdapter } from './external-source.adapter.ts';
import { FakeLayout } from './fake-layout.ts';
import { LocalAddonSourceAdapter } from './local-source.adapter.ts';
import { VALID_MANIFEST, writeAddonPackage } from './manifest-fixtures.ts';

const home = mkdtempSync(join(tmpdir(), 'addon-sources-'));
const layout = new FakeLayout();
const builtin = new BuiltinAddonSourceAdapter(layout, join(home, 'add-ons'));
const local = new LocalAddonSourceAdapter(layout);
const external = new ExternalAddonSourceAdapter();

const sourceDir = writeAddonPackage(join(home, 'add-ons', 'harnesys.test-addon'));

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('BuiltinAddonSourceAdapter', () => {
  test('stage copies to staging, computes digest and sets builtin trust', async () => {
    const plan = await builtin.stage({ source: 'harnesys.test-addon' });
    expect(plan.trust).toBe('builtin');
    expect(plan.manifest.id).toBe('harnesys.test-addon');
    expect(plan.stagingRef.startsWith(addonStagingDir(layout.home(), plan.planId))).toBe(true);
    expect(plan.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(plan.stagingRef, 'addon.json'))).toBe(true);
  });

  test('release removes the staging directory', async () => {
    const plan = await builtin.stage({ source: 'harnesys.test-addon' });
    releaseStaging(layout.home(), plan.planId);
    expect(existsSync(plan.stagingRef)).toBe(false);
  });

  test('missing source directory fails', async () => {
    await expect(builtin.stage({ source: 'harnesys.no-such-addon' })).rejects.toThrow();
  });
});

describe('LocalAddonSourceAdapter', () => {
  test('stages a developer directory with local trust', async () => {
    const devDir = writeAddonPackage(join(home, 'dev', 'my-addon'));
    const plan = await local.stage({ source: devDir });
    expect(plan.trust).toBe('local');
    expect(plan.manifest.id).toBe('harnesys.test-addon');
  });
});

describe('ExternalAddonSourceAdapter', () => {
  test('stage and release throw until the verifier ships (§4.4/§21)', async () => {
    await expect(external.stage({ source: 'https://example.com/addon.hxa' })).rejects.toThrow(
      /disabled until the package verifier/,
    );
    expect(() => external.release('plan-1')).toThrow(/disabled until the package verifier/);
  });
});

describe('stageAddonDirectory', () => {
  test('digest is stable across identical packages and changes with content', async () => {
    const same = writeAddonPackage(join(home, 'add-ons', 'harnesys.other-addon'));
    const first = await stageAddonDirectory(layout.home(), sourceDir);
    const second = await stageAddonDirectory(layout.home(), same);
    expect(first.digest).toBe(second.digest);
    const modified = writeAddonPackage(
      join(home, 'add-ons', 'harnesys.modified-addon'),
      VALID_MANIFEST,
      {
        'content/extra.txt': 'extra file changes the digest',
      },
    );
    const third = await stageAddonDirectory(layout.home(), modified);
    expect(first.digest).not.toBe(third.digest);
    releaseStaging(layout.home(), first.planId);
    releaseStaging(layout.home(), second.planId);
    releaseStaging(layout.home(), third.planId);
  });

  test('invalid manifest rejects and cleans staging', async () => {
    const bad = writeAddonPackage(join(home, 'add-ons', 'harnesys.bad-addon'), { id: 'broken' });
    await expect(stageAddonDirectory(layout.home(), bad)).rejects.toThrow(/manifest invalid/);
  });
});
