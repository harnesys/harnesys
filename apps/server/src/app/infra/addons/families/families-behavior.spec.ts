import { describe, expect, test } from 'bun:test';
import type { AddonManifest } from '@harnesys/sdk';
import { FakeMetrics, FakeRegistry } from '../../../application/addons/addons.fakes.ts';
import { FireTriggerUseCase } from '../../../application/addons/triggers/fire-trigger.use-case.ts';
import { FireWindowTracker } from '../../../application/addons/triggers/trigger-limits.ts';
import { AccountHolderBridge } from '../apps-bridge/account-holder.bridge.ts';
import { InboundEventBridge } from '../apps-bridge/inbound-event.bridge.ts';
import { HookDeliveryService, HookFamilyModule } from './hook/hook.family.ts';
import { HookQueue } from './hook/hook-queue.ts';
import { matchRoutePattern } from './route/route-pattern.ts';
import {
  ACCOUNT_RECORD,
  bindingRow,
  FakeAccountHolderPort,
  FakeAccountRepository,
} from './testing/apps-fakes.ts';
import { buildFamilyBundle, type FamilyBundle } from './testing/bundle.ts';
import { FakeLogger, MANIFEST, OWNER } from './testing/fakes.ts';
import {
  FakeEventBus,
  FakeInstanceSupervisor,
  FakeTriggerInstanceRepository,
} from './testing/repo-fakes.ts';
import { FakePackageCatalog, FakeRunDispatchPort } from './testing/run-fakes.ts';
import { TriggerFireService } from './trigger/trigger-fire.sink.ts';

describe('route pattern matcher', () => {
  test('matches static and :param segments', () => {
    expect(matchRoutePattern('/items/:id', '/items/42')).toEqual({ params: { id: '42' } });
    expect(matchRoutePattern('/items/:id', '/items/42/sub')).toBeNull();
    expect(matchRoutePattern('/items/:id', '/orders/42')).toBeNull();
    expect(matchRoutePattern('/health', '/health')).toEqual({ params: {} });
    expect(matchRoutePattern('/a/:x/b/:y', '/a/1/b/2')).toEqual({ params: { x: '1', y: '2' } });
    expect(matchRoutePattern('/a/:/b', '/a/1/b')).toBeNull();
  });
});

describe('hook queue drop-oldest', () => {
  test('drops oldest entries beyond the limit and counts them', () => {
    const queue = new HookQueue(3);
    for (const seq of ['1', '2', '3', '4', '5']) {
      queue.push({ hookId: 'h', event: { seq } });
    }
    expect(queue.size).toBe(3);
    expect(queue.droppedTotal).toBe(2);
    expect(queue.take()?.event.seq).toBe('3');
  });
});

function enableOwner(bundle: FamilyBundle): void {
  bundle.orgAddons.upsert({
    orgId: OWNER.orgId,
    addonId: OWNER.addonId,
    version: OWNER.version,
    enabled: true,
    grantsJson: '[]',
    grantsDigest: '',
    configJson: '{}',
    health: 'stopped',
    lastError: null,
    createdAt: '',
    updatedAt: '',
  });
}

describe('trigger contributor unavailable-state semantics', () => {
  test('kind disconnected when addon disabled or required connection unbound', () => {
    const bundle = buildFamilyBundle();
    enableOwner(bundle);
    const disposable = bundle.trigger.register(OWNER, {
      kind: 'feed',
      title: 'Feed',
      description: 'feed',
      configFields: [],
      connection: 'github',
    });
    const kinds = bundle.triggerContributor.kinds(OWNER.orgId);
    expect(kinds).toHaveLength(1);
    expect(kinds[0]?.requiresConnection).toBe(true);
    expect(kinds[0]?.connected).toBe(false);
    disposable.dispose();
    expect(bundle.triggerContributor.kinds(OWNER.orgId)).toHaveLength(0);
  });

  test('kind connected when binding exists and addon enabled', () => {
    const bundle = buildFamilyBundle();
    enableOwner(bundle);
    bundle.bindings.rows.push(bindingRow('github', 'acc-1'));
    bundle.trigger.register(OWNER, {
      kind: 'feed',
      title: 'Feed',
      description: 'feed',
      configFields: [],
      connection: 'github',
    });
    expect(bundle.triggerContributor.kinds(OWNER.orgId)[0]?.connected).toBe(true);
  });
});

describe('job scheduler', () => {
  test('single-flight: overlapping fire calls share one job.run', async () => {
    const bundle = buildFamilyBundle();
    const owner = OWNER;
    const descriptor = {
      id: 'sync',
      title: 'Sync',
      schedule: { everySec: 30 } as const,
      catchUp: 'none' as const,
    };
    bundle.job.register(owner, descriptor);
    await Promise.all([
      bundle.jobScheduler.fire(owner, descriptor),
      bundle.jobScheduler.fire(owner, descriptor),
    ]);
    const jobRuns = bundle.calls.calls.filter((call) => call.method === 'job.run');
    expect(jobRuns).toHaveLength(1);
  });

  test('run-now executes even without cron tick', async () => {
    const bundle = buildFamilyBundle();
    bundle.job.register(OWNER, {
      id: 'sync',
      title: 'Sync',
      schedule: { everySec: 30 },
      catchUp: 'none',
      defaultEnabled: false,
    });
    await bundle.job.runJobNow(OWNER.orgId, OWNER.addonId, 'sync');
    const jobRuns = bundle.calls.calls.filter((call) => call.method === 'job.run');
    expect(jobRuns).toHaveLength(1);
  });

  test('catchUp once fires one missed run at registration', async () => {
    const bundle = buildFamilyBundle();
    bundle.jobState.upsert({
      orgId: OWNER.orgId,
      addonId: OWNER.addonId,
      jobId: 'sync',
      nextRunAt: Date.now() - 60_000,
      lastRunAt: null,
      lastStatus: null,
      enabled: true,
    });
    bundle.job.register(OWNER, {
      id: 'sync',
      title: 'Sync',
      schedule: { everySec: 30 },
      catchUp: 'once',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const jobRuns = bundle.calls.calls.filter((call) => call.method === 'job.run');
    expect(jobRuns.length).toBeLessThanOrEqual(2);
    expect(jobRuns.length).toBeGreaterThanOrEqual(1);
  });

  test('job failure records last_status with the error reason', async () => {
    const bundle = buildFamilyBundle();
    bundle.calls.failOnce(new Error('boom'));
    const descriptor = {
      id: 'sync',
      title: 'Sync',
      schedule: { everySec: 30 } as const,
      catchUp: 'none' as const,
    };
    bundle.job.register(OWNER, descriptor);
    await bundle.jobScheduler.fire(OWNER, descriptor);
    expect(bundle.jobState.find(OWNER.orgId, OWNER.addonId, 'sync')?.lastStatus).toBe('boom');
  });
});

describe('trigger fire service', () => {
  function buildFireService(instances: FakeTriggerInstanceRepository, runs: FakeRunDispatchPort) {
    const useCase = new FireTriggerUseCase(
      instances,
      new FakeRegistry(),
      runs,
      new FireWindowTracker(),
      new FakeMetrics(),
      new FakeLogger(),
    );
    return new TriggerFireService(useCase, new FakeLogger());
  }

  test('deduplicates by runKey and dispatches to the target', async () => {
    const instances = new FakeTriggerInstanceRepository();
    const runs = new FakeRunDispatchPort();
    const service = buildFireService(instances, runs);
    instances.create({
      id: 'inst-1',
      orgId: OWNER.orgId,
      addonId: OWNER.addonId,
      triggerId: 'feed',
      label: 'Feed',
      configJson: '{}',
      instructions: '',
      targetJson: JSON.stringify({ threadId: 't-1', agentId: 'a-1' }),
      enabled: true,
      createdAt: '',
      updatedAt: '',
    });
    const first = await service.fire({
      orgId: OWNER.orgId,
      addonId: OWNER.addonId,
      instanceId: 'inst-1',
      runKey: 'rk-1',
      text: 'hello',
    });
    const second = await service.fire({
      orgId: OWNER.orgId,
      addonId: OWNER.addonId,
      instanceId: 'inst-1',
      runKey: 'rk-1',
      text: 'hello',
    });
    expect(first).toBe('fired');
    expect(second).toBe('suppressed');
    expect(runs.dispatched).toHaveLength(1);
    expect(runs.dispatched[0]).toMatchObject({ threadId: 't-1', agentId: 'a-1', text: 'hello' });
  });

  test('unknown or foreign instance fails closed', async () => {
    const service = buildFireService(
      new FakeTriggerInstanceRepository(),
      new FakeRunDispatchPort(),
    );
    const outcome = await service.fire({
      orgId: OWNER.orgId,
      addonId: OWNER.addonId,
      instanceId: 'nope',
      runKey: 'rk',
    });
    expect(outcome).toBe('failed');
  });
});

describe('provider event routing (apps-bridge inbound)', () => {
  const manifestWithKind: AddonManifest = {
    ...MANIFEST,
  };

  function buildBridge() {
    const bundle = buildFamilyBundle();
    const accounts = new FakeAccountRepository();
    accounts.records.push(ACCOUNT_RECORD);
    const catalog = new FakePackageCatalog();
    catalog.installed.push({
      id: OWNER.addonId,
      version: OWNER.version,
      digest: 'd',
      source: 'builtin',
      trust: 'builtin',
      root: '/tmp/x',
      manifest: manifestWithKind,
      installedAt: '',
    });
    const bridge = new InboundEventBridge(
      bundle.hookRouting,
      bundle.hookDelivery,
      bundle.bindings,
      accounts,
      catalog,
      new FakeLogger(),
    );
    return { bundle, bridge };
  }

  test('delivers provider events bound to the declared connection with passing type filter', async () => {
    const { bundle, bridge } = buildBridge();
    bundle.bindings.rows.push(bindingRow('github', 'acc-1'));
    bundle.hook.register(OWNER, {
      id: 'on-push',
      on: { providerEvent: { connection: 'github', types: ['push'] } },
    });
    await bridge.publish(OWNER.orgId, {
      orgId: OWNER.orgId,
      appId: null,
      accountId: 'acc-1',
      kind: 'github',
      event: { type: 'push', deliveryId: 'd1', payload: {} },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const deliveries = bundle.calls.calls.filter((call) => call.method === 'hook.deliver');
    expect(deliveries).toHaveLength(1);
    expect(bundle.supervisor.ensureCalls.length).toBeGreaterThan(0);
  });

  test('skips events with filtered-out type or unbound account', async () => {
    const { bundle, bridge } = buildBridge();
    bundle.bindings.rows.push(bindingRow('github', 'acc-1'));
    bundle.hook.register(OWNER, {
      id: 'on-push',
      on: { providerEvent: { connection: 'github', types: ['push'] } },
    });
    await bridge.publish(OWNER.orgId, {
      orgId: OWNER.orgId,
      appId: null,
      accountId: 'acc-1',
      kind: 'github',
      event: { type: 'issue', deliveryId: 'd2', payload: {} },
    });
    await bridge.publish(OWNER.orgId, {
      orgId: OWNER.orgId,
      appId: null,
      accountId: 'acc-other',
      kind: 'github',
      event: { type: 'push', deliveryId: 'd3', payload: {} },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const deliveries = bundle.calls.calls.filter((call) => call.method === 'hook.deliver');
    expect(deliveries).toHaveLength(0);
  });
});

describe('account holder bridge lookup', () => {
  test('returns addon holders for bound accounts and unregisters on destroy', async () => {
    const holders = new FakeAccountHolderPort();
    const bundle = buildFamilyBundle();
    bundle.bindings.rows.push(bindingRow('github', 'acc-1'));
    const bridge = new AccountHolderBridge(holders, bundle.bindings);
    bridge.onModuleInit();
    expect(holders.registrations).toHaveLength(1);
    expect(await bridge.lookup(OWNER.orgId, 'acc-1')).toEqual([
      { holderType: 'addon', holderId: OWNER.addonId, label: OWNER.addonId },
    ]);
    expect(await bridge.lookup(OWNER.orgId, 'acc-none')).toEqual([]);
    bridge.onModuleDestroy();
    expect(holders.registrations).toHaveLength(0);
  });
});

describe('host event hook subscription', () => {
  test('thread.* events are enqueued and delivered with lazy start', async () => {
    const bundle = buildFamilyBundle();
    const bus = new FakeEventBus();
    const supervisor = new FakeInstanceSupervisor();
    const delivery = new HookDeliveryService(supervisor, bundle.calls, new FakeLogger());
    const module = new HookFamilyModule(bus, bundle.hookRouting, delivery);
    const disposable = module.register(OWNER, { id: 'on-thread', on: { event: 'thread.*' } });
    bus.publish(OWNER.orgId, 'thread.created', { title: 'hi' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    disposable.dispose();
    const deliveries = bundle.calls.calls.filter((call) => call.method === 'hook.deliver');
    expect(deliveries).toHaveLength(1);
    expect(supervisor.ensureCalls).toContain('hook:on-thread');
  });
});
