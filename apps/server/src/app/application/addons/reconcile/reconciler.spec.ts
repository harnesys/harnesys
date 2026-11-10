import { describe, expect, test } from 'bun:test';
import {
  FakeClock,
  FakeSupervisor,
  InMemoryCatalog,
  InMemoryOrgAddons,
  InMemoryTriggers,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { AddonReconciler } from './reconciler.ts';

function build(activation: 'lazy' | 'resident' = 'lazy') {
  const { pkg } = testManifest({ activation });
  const catalog = new InMemoryCatalog();
  catalog.packages.set(`acme.tool@1.0.0`, pkg);
  const orgAddons = new InMemoryOrgAddons();
  const triggers = new InMemoryTriggers();
  const supervisor = new FakeSupervisor();
  const clock = new FakeClock();
  const reconciler = new AddonReconciler(
    orgAddons,
    catalog,
    supervisor,
    triggers,
    clock,
    new NullLogger(),
  );
  const enable = (enabled: boolean) => {
    orgAddons.upsert({
      orgId: 'org1',
      addonId: 'acme.tool',
      version: '1.0.0',
      enabled,
      grantsJson: '[]',
      grantsDigest: 'd',
      configJson: '{}',
      health: 'stopped',
      lastError: null,
      createdAt: 't0',
      updatedAt: 't0',
    });
  };
  return { reconciler, orgAddons, triggers, supervisor, clock, enable, catalog };
}

describe('AddonReconciler', () => {
  test('starts enabled addon with a live trigger instance, idempotently', async () => {
    const { reconciler, triggers, supervisor, enable } = build();
    enable(true);
    triggers.create({
      id: 'inst1',
      orgId: 'org1',
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'feed',
      configJson: '{}',
      targetJson: '{}',
      enabled: true,
      createdAt: 't0',
      updatedAt: 't0',
    });
    await reconciler.reconcile();
    await reconciler.reconcile();
    expect(supervisor.started).toHaveLength(1);
    expect(supervisor.started[0]).toContain('org1/acme.tool');
  });

  test('starts resident addons without trigger instances', async () => {
    const { reconciler, supervisor, enable } = build('resident');
    enable(true);
    await reconciler.reconcile();
    expect(supervisor.started).toHaveLength(1);
  });

  test('does not start lazy addon without live reasons', async () => {
    const { reconciler, supervisor, enable } = build();
    enable(true);
    await reconciler.reconcile();
    expect(supervisor.started).toEqual([]);
  });

  test('stops running instance of disabled addon', async () => {
    const { reconciler, supervisor, enable } = build();
    enable(false);
    supervisor.states.set('org1/acme.tool', {
      orgId: 'org1',
      addonId: 'acme.tool',
      generation: 1,
      state: 'running',
      restarts: 0,
    });
    await reconciler.reconcile();
    expect(supervisor.stopped).toContain('org1/acme.tool');
    expect(supervisor.snapshot('org1', 'acme.tool')).toBeNull();
  });

  test('skips quarantined instances', async () => {
    const { reconciler, supervisor, enable, triggers } = build();
    enable(true);
    triggers.create({
      id: 'inst1',
      orgId: 'org1',
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'feed',
      configJson: '{}',
      targetJson: '{}',
      enabled: true,
      createdAt: 't0',
      updatedAt: 't0',
    });
    supervisor.states.set('org1/acme.tool', {
      orgId: 'org1',
      addonId: 'acme.tool',
      generation: 1,
      state: 'quarantined',
      restarts: 5,
    });
    await reconciler.reconcile();
    expect(supervisor.started).toEqual([]);
  });

  test('mirrors failed health when start throws', async () => {
    const { reconciler, supervisor, enable, triggers } = build();
    enable(true);
    supervisor.failStart = true;
    triggers.create({
      id: 'inst1',
      orgId: 'org1',
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'feed',
      configJson: '{}',
      targetJson: '{}',
      enabled: true,
      createdAt: 't0',
      updatedAt: 't0',
    });
    await reconciler.reconcile();
    expect(supervisor.started).toEqual([]);
    expect(supervisor.snapshot('org1', 'acme.tool')).toBeNull();
  });

  test('cleans up expired trigger fires', async () => {
    const { reconciler, triggers, clock } = build();
    triggers.recordFire('inst1', 'old', clock.now() - 8 * 24 * 60 * 60 * 1000);
    triggers.recordFire('inst1', 'fresh', clock.now());
    await reconciler.reconcile();
    expect(triggers.fires.has('inst1/fresh')).toBe(true);
    expect(triggers.fires.has('inst1/old')).toBe(false);
  });

  test('start is a no-op when already running, stop stops the timer', () => {
    const { reconciler } = build();
    reconciler.start();
    reconciler.start();
    reconciler.stop();
    reconciler.stop();
  });
});
