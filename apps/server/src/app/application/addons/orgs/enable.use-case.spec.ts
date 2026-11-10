import { describe, expect, test } from 'bun:test';
import { AddonException, AddonIncompatibleException } from '../../../domain/addons/errors.ts';
import { grantDigest } from '../../../domain/addons/permissions.ts';
import {
  FakeAudit,
  FakePolicy,
  FakeRegistry,
  InMemoryCatalog,
  InMemoryOrgAddons,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { EnableAddonUseCase } from './enable.use-case.ts';

const ACTOR = { kind: 'user' as const, id: 'admin' };

function build(overrides?: Parameters<typeof testManifest>[0]) {
  const { manifest, pkg } = testManifest(overrides);
  const catalog = new InMemoryCatalog();
  catalog.packages.set(`${pkg.id}@${pkg.version}`, pkg);
  const orgAddons = new InMemoryOrgAddons();
  const registry = new FakeRegistry();
  const useCase = new EnableAddonUseCase(
    catalog,
    orgAddons,
    registry,
    new FakePolicy(),
    new FakeAudit(),
    new NullLogger(),
  );
  return { useCase, orgAddons, registry, pkg, manifest };
}

describe('EnableAddonUseCase', () => {
  test('pins version, stores grants and digest, activates contributions', () => {
    const { useCase, registry, manifest } = build();
    const row = useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      grants: [{ id: 'http.fetch' }],
      actor: ACTOR,
    });
    expect(row.enabled).toBe(true);
    expect(row.version).toBe('1.0.0');
    expect(row.grantsDigest).toBe(grantDigest(manifest.permissions));
    expect(JSON.parse(row.grantsJson)).toEqual([{ id: 'http.fetch' }]);
    expect(registry.events).toContain('activate:org1/acme.tool@1.0.0');
  });

  test('rejects incompatible package', () => {
    const { useCase } = build({ platform: 9 });
    expect(() =>
      useCase.execute({ orgId: 'org1', addonId: 'acme.tool', grants: [], actor: ACTOR }),
    ).toThrow(AddonIncompatibleException);
  });

  test('rejects enable without mandatory permissions', () => {
    const { useCase } = build();
    try {
      useCase.execute({ orgId: 'org1', addonId: 'acme.tool', grants: [], actor: ACTOR });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AddonException);
      expect((error as AddonException).reason).toBe('needs_consent');
    }
  });

  test('re-enable with same version is idempotent and keeps config', () => {
    const { useCase, orgAddons } = build();
    useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      grants: [{ id: 'http.fetch' }],
      actor: ACTOR,
    });
    orgAddons.updateConfig('org1', 'acme.tool', '{"region":"eu"}');
    const row = useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      grants: [{ id: 'http.fetch' }],
      actor: ACTOR,
    });
    expect(JSON.parse(row.configJson)).toEqual({ region: 'eu' });
  });

  test('unknown package is not found', () => {
    const { useCase } = build();
    expect(() =>
      useCase.execute({ orgId: 'org1', addonId: 'acme.other', grants: [], actor: ACTOR }),
    ).toThrow(AddonException);
  });
});
