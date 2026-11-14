import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VALID_MANIFEST, writeAddonPackage } from './manifest-fixtures.ts';
import { loadAddonManifest } from './manifest-loader.ts';

let home = '';

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'addon-manifest-'));
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('loadAddonManifest', () => {
  test('valid package loads with zero violations', () => {
    const root = writeAddonPackage(join(home, 'valid'));
    const result = loadAddonManifest(root);
    expect(result.manifest).not.toBeNull();
    expect(result.violations).toEqual([]);
  });

  test('all violations reported at once per §4.3', () => {
    const broken = {
      ...VALID_MANIFEST,
      description: '%unknown.l10n.key%',
      permissions: [...VALID_MANIFEST.permissions, { id: 'not.a.permission', reason: 'unknown' }],
      connections: [],
      contributions: [VALID_MANIFEST.contributions[0], { ...VALID_MANIFEST.contributions[0] }],
    };
    const root = writeAddonPackage(join(home, 'broken'), broken);
    const result = loadAddonManifest(root);
    expect(result.violations.length).toBeGreaterThanOrEqual(4);
    const codes = result.violations.map((violation) => violation.code);
    expect(codes).toContain('unknown_permission');
    expect(codes).toContain('unknown_connection');
    expect(codes).toContain('duplicate_contribution_id');
    expect(codes).toContain('missing_l10n_key');
  });

  test('unknown family is a warning for optional contribution and error otherwise', () => {
    const optionalRoot = writeAddonPackage(join(home, 'optional'), {
      ...VALID_MANIFEST,
      contributions: [{ id: 'x', family: 'no-such-family', optional: true, descriptor: {} }],
    });
    const optional = loadAddonManifest(optionalRoot);
    expect(optional.violations.map((v) => v.code)).toContain('unknown_family');
    expect(optional.violations.find((v) => v.code === 'unknown_family')?.severity).toBe('warning');

    const requiredRoot = writeAddonPackage(join(home, 'required'), {
      ...VALID_MANIFEST,
      contributions: [{ id: 'x', family: 'no-such-family', descriptor: {} }],
    });
    const required = loadAddonManifest(requiredRoot);
    expect(required.violations.find((v) => v.code === 'unknown_family')?.severity).toBe('error');
  });

  test('descriptor over size limit is reported', () => {
    const root = writeAddonPackage(join(home, 'large'), {
      ...VALID_MANIFEST,
      contributions: [
        {
          id: 'big',
          family: 'tool-pack',
          descriptor: { blob: 'x'.repeat(300 * 1024) },
        },
      ],
    });
    const result = loadAddonManifest(root);
    expect(result.violations.map((v) => v.code)).toContain('descriptor_too_large');
  });

  test('missing addon.json and unparseable JSON produce manifest errors', () => {
    const missing = loadAddonManifest(join(home, 'missing'));
    expect(missing.manifest).toBeNull();
    expect(missing.violations.map((v) => v.code)).toContain('manifest_missing');

    const root = writeAddonPackage(join(home, 'unparseable'));
    const addonJson = join(root, 'addon.json');
    rmSync(addonJson);
    writeFileSync(addonJson, '{oops');
    const unparseable = loadAddonManifest(root);
    expect(unparseable.manifest).toBeNull();
    expect(unparseable.violations.map((v) => v.code)).toContain('manifest_unparseable');
  });
});
