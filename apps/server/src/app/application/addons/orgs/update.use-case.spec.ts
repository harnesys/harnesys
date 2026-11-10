import { describe, expect, test } from 'bun:test';
import { AddonNeedsConsentException } from '../../../domain/addons/errors.ts';
import {
  FakeAudit,
  FakeRegistry,
  FakeSupervisor,
  InMemoryCatalog,
  InMemoryOrgAddons,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { UpdateAddonUseCase } from './update.use-case.ts';

const ACTOR = { kind: 'user' as const, id: 'admin' };

function seed(
  catalog: InMemoryCatalog,
  version: string,
  permissions: Array<{ id: string; reason: string }>,
): void {
  const { pkg } = testManifest({ version, permissions });
  catalog.packages.set(`acme.tool@${version}`, pkg);
}

function build() {
  const catalog = new InMemoryCatalog();
  const { pkg } = testManifest({
    version: '1.0.0',
    permissions: [{ id: 'http.fetch', reason: 'network' }],
  });
  catalog.packages.set(`acme.tool@1.0.0`, pkg);
  seed(catalog, '1.1.0', [
    { id: 'http.fetch', reason: 'network' },
    { id: 'accounts.use', reason: 'accounts' },
  ]);
  seed(catalog, '1.0.1', [{ id: 'http.fetch', reason: 'network' }]);
  const orgAddons = new InMemoryOrgAddons();
  const registry = new FakeRegistry();
  const supervisor = new FakeSupervisor();
  const useCase = new UpdateAddonUseCase(
    catalog,
    orgAddons,
    registry,
    supervisor,
    new FakeAudit(),
    new NullLogger(),
  );
  orgAddons.upsert({
    orgId: 'org1',
    addonId: 'acme.tool',
    version: '1.0.0',
    enabled: true,
    grantsJson: '[{"id":"http.fetch"}]',
    grantsDigest: 'd0',
    configJson: '{}',
    health: 'running',
    lastError: null,
    createdAt: 't0',
    updatedAt: 't0',
  });
  return { useCase, orgAddons, registry, supervisor, catalog };
}

describe('UpdateAddonUseCase', () => {
  test('applies update that stays within grants', async () => {
    const { useCase, registry, supervisor } = build();
    const row = await useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      version: '1.0.1',
      actor: ACTOR,
    });
    expect(row.version).toBe('1.0.1');
    expect(row.lastError).toBeNull();
    expect(registry.events).toContain('swap:1.0.0->1.0.1');
    expect(supervisor.stopped).toContain('org1/acme.tool');
  });

  test('expanding permissions without grants lands in needs_consent', async () => {
    const { useCase, orgAddons } = build();
    try {
      await useCase.execute({
        orgId: 'org1',
        addonId: 'acme.tool',
        version: '1.1.0',
        actor: ACTOR,
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AddonNeedsConsentException);
      expect((error as AddonNeedsConsentException).addedPermissions).toEqual(['accounts.use']);
    }
    expect(orgAddons.find('org1', 'acme.tool')?.version).toBe('1.0.0');
  });

  test('expanding permissions with explicit grants applies', async () => {
    const { useCase } = build();
    const row = await useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      version: '1.1.0',
      grants: [{ id: 'http.fetch' }, { id: 'accounts.use' }],
      actor: ACTOR,
    });
    expect(row.version).toBe('1.1.0');
    expect(JSON.parse(row.grantsJson)).toEqual([{ id: 'http.fetch' }, { id: 'accounts.use' }]);
  });

  test('failed swap rolls back pin and writes last_error', async () => {
    const { useCase, orgAddons, registry } = build();
    registry.failSwap = true;
    await expect(
      useCase.execute({ orgId: 'org1', addonId: 'acme.tool', version: '1.0.1', actor: ACTOR }),
    ).rejects.toThrow('swap failed');
    const row = orgAddons.find('org1', 'acme.tool');
    expect(row?.version).toBe('1.0.0');
    expect(row?.health).toBe('failed');
    expect(row?.lastError).toContain('rolled back');
  });

  test('same version update is a no-op', async () => {
    const { useCase, registry } = build();
    const row = await useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      version: '1.0.0',
      actor: ACTOR,
    });
    expect(row.version).toBe('1.0.0');
    expect(registry.events).toEqual([]);
  });
});
