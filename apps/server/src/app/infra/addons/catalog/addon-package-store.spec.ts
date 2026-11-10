import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@harnesys/brix';
import type { AddonInstallRequest } from '../../../domain/addons/ports/addon-package-catalog.port.ts';
import type { AddonStagePlan } from '../../../domain/addons/ports/addon-source.port.ts';
import type { OrgAddonRow } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../domain/addons/ports/org-addon-repository.port.ts';
import { AddonPackagePruner } from './addon-package-pruner.ts';
import { AddonPackageStoreAdapter } from './addon-package-store.adapter.ts';
import { addonPackageDir, addonStagingDir } from './addon-paths.ts';
import { BuiltinAddonSourceAdapter } from './addon-staging.ts';
import { FakeLayout } from './fake-layout.ts';
import { writeAddonPackage } from './manifest-fixtures.ts';

const layout = new FakeLayout();

class FakeLogger extends Logger {
  override child(): Logger {
    return this;
  }

  override info(): void {}

  override debug(): void {}

  override warn(): void {}

  override error(): void {}
}

const store = new AddonPackageStoreAdapter(layout, new FakeLogger());
const builtin = new BuiltinAddonSourceAdapter(layout, join(layout.root, 'sources'));

const _sourceDir = writeAddonPackage(join(layout.root, 'sources', 'harnesys.test-addon'));

afterAll(() => {
  rmSync(layout.root, { recursive: true, force: true });
});

function installRequest(
  plan: AddonStagePlan,
  overrides: Record<string, unknown> = {},
): AddonInstallRequest {
  return {
    stagingRef: plan.stagingRef,
    manifest: plan.manifest,
    digest: plan.digest,
    source: 'builtin:harnesys.test-addon',
    trust: 'builtin',
    ...overrides,
  };
}

describe('AddonPackageStoreAdapter', () => {
  test('install moves staging into add-ons/<id>/<version> and writes the lock', async () => {
    const plan = await builtin.stage({ source: 'harnesys.test-addon' });
    const installed = store.install(installRequest(plan));
    expect(installed.root).toBe(addonPackageDir(layout.home(), 'harnesys.test-addon', '1.0.0'));
    expect(installed.trust).toBe('builtin');
    expect(installed.manifest.id).toBe('harnesys.test-addon');
    expect(existsSync(plan.stagingRef)).toBe(false);
    expect(store.readLock().entries.length).toBe(1);
  });

  test('repeat install of the same version is idempotent', async () => {
    const plan = await builtin.stage({ source: 'harnesys.test-addon' });
    store.install(installRequest(plan));
    const first = store.readLock().entries.length;
    store.install(installRequest(plan));
    expect(store.readLock().entries.length).toBe(first);
    expect(existsSync(plan.stagingRef)).toBe(false);
  });

  test('listInstalled and find read manifest from disk; find picks highest version', async () => {
    const plan = await builtin.stage({ source: 'harnesys.test-addon' });
    const manifest = { ...plan.manifest, version: '1.1.0' };
    store.install(installRequest(plan, { manifest }));
    expect(store.listInstalled().length).toBe(2);
    expect(store.find('harnesys.test-addon')?.version).toBe('1.1.0');
    expect(store.find('harnesys.test-addon', '1.0.0')?.version).toBe('1.0.0');
    expect(store.find('harnesys.nope')).toBeUndefined();
    expect(existsSync(addonStagingDir(layout.home(), plan.planId))).toBe(false);
  });

  test('removePackage deletes the directory and lock entry', () => {
    store.removePackage('harnesys.test-addon', '1.1.0');
    expect(existsSync(addonPackageDir(layout.home(), 'harnesys.test-addon', '1.1.0'))).toBe(false);
    expect(store.find('harnesys.test-addon', '1.1.0')).toBeUndefined();
    expect(store.find('harnesys.test-addon', '1.0.0')).toBeDefined();
  });

  test('pruner removes only versions not pinned by any organization', async () => {
    const _pruner = new AddonPackagePruner(store, new FakeOrgAddons([]));
    const plan = await builtin.stage({ source: 'harnesys.test-addon' });
    store.install(installRequest(plan, { trust: 'local', source: 'dev' }));
    const pinned = new FakeOrgAddons([pinRow('org-1', 'harnesys.test-addon', '1.0.0')]);
    expect(new AddonPackagePruner(store, pinned).prune(['org-1'])).toEqual([]);
    expect(store.find('harnesys.test-addon', '1.0.0')).toBeDefined();
    const removed = new AddonPackagePruner(store, new FakeOrgAddons([])).prune(['org-1']);
    expect(removed.join(',')).toContain('harnesys.test-addon@1.0.0');
    expect(store.readLock().entries.length).toBe(0);
  });
});

function pinRow(orgId: string, addonId: string, version: string): OrgAddonRow {
  return {
    orgId,
    addonId,
    version,
    enabled: true,
    grantsJson: '[]',
    grantsDigest: '',
    configJson: '{}',
    health: 'stopped',
    lastError: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  };
}

class FakeOrgAddons extends OrgAddonRepositoryPort {
  constructor(private readonly rows: OrgAddonRow[] = []) {
    super();
  }

  override list(orgId: string): OrgAddonRow[] {
    return this.rows.filter((row) => row.orgId === orgId);
  }

  override listAll(): OrgAddonRow[] {
    return this.rows;
  }

  override find(): OrgAddonRow | null {
    return null;
  }

  override upsert(): void {}

  override setEnabled(): void {}

  override updateGrants(): void {}

  override updateConfig(): void {}

  override updateHealth(): void {}

  override remove(): void {}
}
