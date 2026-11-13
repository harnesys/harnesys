import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import type { AddonHostPolicy } from '../../../domain/addons/permissions.ts';
import {
  isAddonSourceAllowed,
  kindOfAddonSource,
} from '../../../domain/addons/ports/addon-source.port.ts';
import { GrantPolicyPort } from '../../../domain/addons/ports/grant-policy.port.ts';
import { BuiltinAddonSourceAdapter } from '../catalog/addon-staging.ts';
import { ArchiveAddonSourceAdapter } from '../catalog/archive-source.adapter.ts';
import { ExternalAddonSourceAdapter } from '../catalog/external-source.adapter.ts';
import { FakeLayout } from '../catalog/fake-layout.ts';
import { LocalAddonSourceAdapter } from '../catalog/local-source.adapter.ts';
import { VALID_MANIFEST, writeAddonPackage } from '../catalog/manifest-fixtures.ts';
import { CompositeAddonSourceAdapter } from './addon-source-composite.adapter.ts';

const home = mkdtempSync(join(tmpdir(), 'addon-source-gate-'));
const layout = new FakeLayout();

class FakePolicy extends GrantPolicyPort {
  constructor(private readonly allowed: readonly string[]) {
    super();
  }

  override read(): AddonHostPolicy {
    return { allowedSources: this.allowed };
  }

  override write(_policy: AddonHostPolicy): void {
    throw new Error('not used');
  }
}

function composite(allowed: readonly string[]): CompositeAddonSourceAdapter {
  return new CompositeAddonSourceAdapter(
    new BuiltinAddonSourceAdapter(layout),
    new LocalAddonSourceAdapter(layout),
    new ExternalAddonSourceAdapter(),
    new ArchiveAddonSourceAdapter(layout),
    new FakePolicy(allowed),
  );
}

function zipSource(name: string): string {
  const path = join(home, name);
  writeFileSync(
    path,
    zipSync({
      'addon.json': new TextEncoder().encode(JSON.stringify(VALID_MANIFEST)),
      'dist/index.js': new TextEncoder().encode('export {};'),
      'l10n/en.json': new TextEncoder().encode(JSON.stringify({ description: 'Test addon' })),
    }),
  );
  return path;
}

const dirSource = writeAddonPackage(join(home, 'dev', 'my-addon'));
const otherDirSource = writeAddonPackage(join(home, 'dev', 'other-addon'));
const zip = zipSource('upload.zip');

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(layout.root, { recursive: true, force: true });
});

const POLICY_DISABLED_PATTERN = /disabled by host policy/;

describe('kindOfAddonSource and isAddonSourceAllowed', () => {
  test('routes .zip sources (case-insensitive) to archive, other paths to local-dir', () => {
    expect(kindOfAddonSource(zip)).toBe('archive');
    expect(kindOfAddonSource('/tmp/pkg.ZIP')).toBe('archive');
    expect(kindOfAddonSource(dirSource)).toBe('local-dir');
    expect(kindOfAddonSource('harnesys.test-addon')).toBe('builtin');
    expect(isAddonSourceAllowed(['local-dir'], dirSource)).toBe(true);
    expect(isAddonSourceAllowed(['local-dir'], zip)).toBe(false);
    expect(isAddonSourceAllowed(['archive'], zip)).toBe(true);
    expect(isAddonSourceAllowed([dirSource], dirSource)).toBe(true);
    expect(isAddonSourceAllowed([dirSource], otherDirSource)).toBe(false);
    expect(isAddonSourceAllowed([], zip)).toBe(false);
  });
});

describe('CompositeAddonSourceAdapter gate matrix', () => {
  test('empty allowedSources rejects both local-dir and archive sources', async () => {
    await expect(composite([]).stage({ source: dirSource })).rejects.toThrow(
      POLICY_DISABLED_PATTERN,
    );
    await expect(composite([]).stage({ source: zip })).rejects.toThrow(POLICY_DISABLED_PATTERN);
  });

  test("['local-dir'] allows directories and rejects archives", async () => {
    const gate = composite(['local-dir']);
    const plan = await gate.stage({ source: dirSource });
    expect(plan.trust).toBe('local');
    gate.release(plan.planId);
    await expect(gate.stage({ source: zip })).rejects.toThrow(POLICY_DISABLED_PATTERN);
  });

  test("['local-dir', 'archive'] allows both", async () => {
    const gate = composite(['local-dir', 'archive']);
    const dirPlan = await gate.stage({ source: dirSource });
    const zipPlan = await gate.stage({ source: zip });
    expect(zipPlan.trust).toBe('local');
    expect(zipPlan.manifest.id).toBe('harnesys.test-addon');
    gate.release(dirPlan.planId);
    gate.release(zipPlan.planId);
  });

  test('an exact-path entry allows that path only', async () => {
    const dirGate = composite([dirSource]);
    await expect(dirGate.stage({ source: dirSource })).resolves.toMatchObject({ trust: 'local' });
    await expect(dirGate.stage({ source: otherDirSource })).rejects.toThrow(
      POLICY_DISABLED_PATTERN,
    );
    const zipGate = composite([zip]);
    await expect(zipGate.stage({ source: zip })).resolves.toMatchObject({ trust: 'local' });
  });
});
