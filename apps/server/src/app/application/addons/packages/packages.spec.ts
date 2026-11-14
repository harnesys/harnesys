import { describe, expect, test } from 'bun:test';
import { AddonException, AddonInUseException } from '../../../domain/addons/errors.ts';
import {
  FakeAudit,
  FakePolicy,
  InMemoryCatalog,
  InMemoryOrgAddons,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { ConfirmInstallUseCase } from './confirm-install.use-case.ts';
import { FakeSource } from './packages.fakes.ts';
import { PlanInstallUseCase } from './plan-install.use-case.ts';
import { InstallPlanStore } from './plan-store.ts';
import { PrunePackagesUseCase } from './prune.use-case.ts';
import { RemovePackageUseCase } from './remove-package.use-case.ts';

const HOST = { kind: 'host' as const, id: 'host-admin' };

function build() {
  const catalog = new InMemoryCatalog();
  const orgAddons = new InMemoryOrgAddons();
  const store = new InstallPlanStore();
  const source = new FakeSource();
  const plan = new PlanInstallUseCase(source, store, new FakePolicy(), new NullLogger());
  const confirm = new ConfirmInstallUseCase(
    store,
    catalog,
    source,
    new FakeAudit(),
    new NullLogger(),
  );
  const remove = new RemovePackageUseCase(catalog, orgAddons, new FakeAudit(), new NullLogger());
  const prune = new PrunePackagesUseCase(catalog, orgAddons, new FakeAudit(), new NullLogger());
  return { plan, confirm, remove, prune, catalog, orgAddons, source };
}

describe('PlanInstallUseCase', () => {
  test('stages a plan with permissions and connections', async () => {
    const { plan } = build();
    const installPlan = await plan.execute({ source: 'local:/tmp/acme', actor: HOST });
    expect(installPlan.id).toBe('acme.tool');
    expect(installPlan.version).toBe('1.0.0');
    expect(installPlan.trust).toBe('local');
    expect(installPlan.permissions.map((entry) => entry.id)).toEqual(['http.fetch']);
  });

  test('rejects external trust until verifier exists', async () => {
    const { plan, source } = build();
    source.trust = 'external';
    await expect(plan.execute({ source: 'url:https://cdn.acme.dev', actor: HOST })).rejects.toThrow(
      'verification',
    );
  });

  test('rejects sources outside the allow-list', async () => {
    const policy = new FakePolicy();
    policy.policy.allowedSources = ['local:/trusted-only'];
    const strict = new PlanInstallUseCase(
      new FakeSource(),
      new InstallPlanStore(),
      policy,
      new NullLogger(),
    );
    await expect(strict.execute({ source: 'local:/tmp/other', actor: HOST })).rejects.toThrow(
      'not allowed',
    );
  });
});

describe('ConfirmInstallUseCase', () => {
  test('installs package and writes lock entry', async () => {
    const { plan, confirm, catalog } = build();
    const installPlan = await plan.execute({ source: 'local:/tmp/acme', actor: HOST });
    const confirmed = await confirm.execute({ planId: installPlan.planId, actor: HOST });
    expect(confirmed.id).toBe('acme.tool');
    expect(catalog.find('acme.tool', '1.0.0')).toBeDefined();
    expect(catalog.readLock().entries).toHaveLength(1);
    expect(catalog.readLock().entries[0]).toMatchObject({ id: 'acme.tool', digest: 'digest-1' });
  });

  test('repeat confirm is idempotent on the same digest', async () => {
    const { plan, confirm, catalog, source: buildSource } = build();
    const first = await plan.execute({ source: 'local:/tmp/acme', actor: HOST });
    await confirm.execute({ planId: first.planId, actor: HOST });
    const second = await plan.execute({ source: 'local:/tmp/acme', actor: HOST });
    await confirm.execute({ planId: second.planId, actor: HOST });
    expect(catalog.listInstalled()).toHaveLength(1);
    expect(buildSource.released).toHaveLength(2);
  });

  test('same version with a different digest replaces the installed package', async () => {
    const { plan, confirm, catalog, source } = build();
    const first = await plan.execute({ source: 'local:/tmp/acme', actor: HOST });
    await confirm.execute({ planId: first.planId, actor: HOST });
    source.digest = 'digest-2';
    const second = await plan.execute({ source: 'local:/tmp/acme', actor: HOST });
    const confirmed = await confirm.execute({ planId: second.planId, actor: HOST });
    expect(catalog.listInstalled()).toHaveLength(1);
    expect(catalog.find('acme.tool', '1.0.0')?.digest).toBe('digest-2');
    expect(confirmed.digest).toBe('digest-2');
    expect(catalog.readLock().entries[0]).toMatchObject({ id: 'acme.tool', digest: 'digest-2' });
  });

  test('unknown plan id is not found', async () => {
    const { confirm } = build();
    await expect(confirm.execute({ planId: 'nope', actor: HOST })).rejects.toThrow(AddonException);
  });
});

describe('RemovePackageUseCase', () => {
  test('removes unpinned version and lock entry', () => {
    const { remove, catalog } = build();
    const { pkg } = testManifest();
    catalog.packages.set(`acme.tool@1.0.0`, pkg);
    catalog.writeLock({ entries: [{ ...pkg, installedAt: pkg.installedAt }] });
    remove.execute({ id: 'acme.tool', version: '1.0.0', actor: HOST });
    expect(catalog.find('acme.tool', '1.0.0')).toBeUndefined();
    expect(catalog.readLock().entries).toHaveLength(0);
  });

  test('rejects removal while an organization pins the version', () => {
    const { remove, catalog, orgAddons } = build();
    const { pkg } = testManifest();
    catalog.packages.set(`acme.tool@1.0.0`, pkg);
    orgAddons.upsert({
      orgId: 'org1',
      addonId: 'acme.tool',
      version: '1.0.0',
      enabled: true,
      grantsJson: '[]',
      grantsDigest: 'd',
      configJson: '{}',
      health: 'stopped',
      lastError: null,
      createdAt: 't0',
      updatedAt: 't0',
    });
    expect(() => remove.execute({ id: 'acme.tool', version: '1.0.0', actor: HOST })).toThrow(
      AddonInUseException,
    );
    expect(catalog.find('acme.tool', '1.0.0')).toBeDefined();
  });
});

describe('PrunePackagesUseCase', () => {
  test('removes versions not pinned by any organization, keeps builtin', () => {
    const { prune, catalog, orgAddons } = build();
    const builtin = testManifest();
    const local = testManifest({ id: 'acme.local', version: '2.0.0' });
    builtin.pkg.trust = 'builtin';
    local.pkg.trust = 'local';
    catalog.packages.set(`acme.tool@1.0.0`, builtin.pkg);
    catalog.packages.set(`acme.local@2.0.0`, local.pkg);
    catalog.writeLock({
      entries: [
        { ...builtin.pkg, installedAt: builtin.pkg.installedAt },
        { ...local.pkg, installedAt: local.pkg.installedAt },
      ],
    });
    orgAddons.upsert({
      orgId: 'org1',
      addonId: 'acme.tool',
      version: '1.0.0',
      enabled: true,
      grantsJson: '[]',
      grantsDigest: 'd',
      configJson: '{}',
      health: 'stopped',
      lastError: null,
      createdAt: 't0',
      updatedAt: 't0',
    });
    const result = prune.execute(HOST);
    expect(result.removed).toEqual([{ id: 'acme.local', version: '2.0.0' }]);
    expect(catalog.find('acme.tool', '1.0.0')).toBeDefined();
    expect(catalog.find('acme.local', '2.0.0')).toBeUndefined();
    expect(orgAddons.listAll()).toHaveLength(1);
  });
});
