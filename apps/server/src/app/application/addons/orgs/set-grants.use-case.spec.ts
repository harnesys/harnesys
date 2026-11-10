import { describe, expect, test } from 'bun:test';
import {
  FakeAudit,
  FakeEvents,
  FakePolicy,
  FakeSupervisor,
  InMemoryCatalog,
  InMemoryOrgAddons,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { SetGrantsUseCase } from './set-grants.use-case.ts';

const ACTOR = { kind: 'user' as const, id: 'admin' };

function build() {
  const { pkg } = testManifest({
    permissions: [{ id: 'http.fetch', reason: 'network' }],
  });
  const catalog = new InMemoryCatalog();
  catalog.packages.set(`acme.tool@1.0.0`, pkg);
  const orgAddons = new InMemoryOrgAddons();
  orgAddons.upsert({
    orgId: 'org1',
    addonId: 'acme.tool',
    version: '1.0.0',
    enabled: true,
    grantsJson: '[]',
    grantsDigest: 'd',
    configJson: '{}',
    health: 'running',
    lastError: null,
    createdAt: 't0',
    updatedAt: 't0',
  });
  const supervisor = new FakeSupervisor();
  supervisor.states.set('org1/acme.tool', {
    orgId: 'org1',
    addonId: 'acme.tool',
    generation: 1,
    state: 'running',
    restarts: 0,
  });
  const events = new FakeEvents();
  const setGrants = new SetGrantsUseCase(
    catalog,
    orgAddons,
    supervisor,
    new FakePolicy(),
    events,
    new FakeAudit(),
    new NullLogger(),
  );
  return { setGrants, orgAddons, supervisor, events };
}

describe('SetGrantsUseCase', () => {
  test('stores grants and digest', async () => {
    const { setGrants, orgAddons } = build();
    const row = await setGrants.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      grants: [{ id: 'http.fetch', scope: { hosts: ['api.acme.dev'] } }],
      actor: ACTOR,
    });
    expect(JSON.parse(row.grantsJson)).toEqual([
      { id: 'http.fetch', scope: { hosts: ['api.acme.dev'] } },
    ]);
    expect(orgAddons.find('org1', 'acme.tool')?.grantsDigest).toBe(row.grantsDigest);
  });

  test('rejects grants not declared by the version', async () => {
    const { setGrants } = build();
    await expect(
      setGrants.execute({
        orgId: 'org1',
        addonId: 'acme.tool',
        grants: [{ id: 'routes.public' }],
        actor: ACTOR,
      }),
    ).rejects.toThrow('not declared');
  });

  test('revoking a mandatory permission stops the addon with permission_revoked', async () => {
    const { setGrants, supervisor, orgAddons, events } = build();
    await setGrants.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      grants: [],
      actor: ACTOR,
    });
    expect(supervisor.stopped).toContain('org1/acme.tool');
    expect(orgAddons.find('org1', 'acme.tool')?.lastError).toBe('permission_revoked');
    expect(events.published.some((entry) => entry.name === 'permissions.changed')).toBe(true);
  });
});
