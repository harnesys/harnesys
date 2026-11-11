import { describe, expect, test } from 'bun:test';
import { AddonException } from '../../../domain/addons/errors.ts';
import {
  FakeAudit,
  InMemoryCatalog,
  InMemoryOrgAddons,
  InMemoryTriggers,
  NoopCalls,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { ManageTriggerInstanceUseCase } from './manage-instance.use-case.ts';

const ACTOR = { kind: 'user' as const, id: 'admin' };

function build(enabled = true) {
  const { pkg } = testManifest({
    contributions: [
      {
        id: 'feed',
        family: 'trigger',
        descriptor: { kind: 'feed', configFields: [] },
      },
    ],
  });
  const catalog = new InMemoryCatalog();
  catalog.packages.set(`acme.tool@1.0.0`, pkg);
  const orgAddons = new InMemoryOrgAddons();
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
  const triggers = new InMemoryTriggers();
  const calls = new NoopCalls();
  const useCase = new ManageTriggerInstanceUseCase(
    orgAddons,
    catalog,
    triggers,
    calls,
    new FakeAudit(),
    new NullLogger(),
  );
  return { useCase, triggers, calls };
}

describe('ManageTriggerInstanceUseCase', () => {
  test('creates instance and starts it when enabled', () => {
    const { useCase, triggers, calls } = build();
    const row = useCase.create({
      orgId: 'org1',
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: { url: 'https://acme.dev' },
      target: { threadId: 'th1', agentId: 'ag1' },
      actor: ACTOR,
    });
    expect(row.enabled).toBe(true);
    expect(triggers.find('org1', row.id)?.label).toBe('Feed');
    expect(calls.calls).toContain(`trigger.start:${row.id}`);
  });

  test('rejects create when addon is disabled', () => {
    const { useCase } = build(false);
    expect(() =>
      useCase.create({
        orgId: 'org1',
        addonId: 'acme.tool',
        triggerId: 'feed',
        label: 'Feed',
        config: {},
        actor: ACTOR,
      }),
    ).toThrow(AddonException);
  });

  test('rejects undeclared trigger kind', () => {
    const { useCase } = build();
    expect(() =>
      useCase.create({
        orgId: 'org1',
        addonId: 'acme.tool',
        triggerId: 'ghost',
        label: 'Ghost',
        config: {},
        actor: ACTOR,
      }),
    ).toThrow('not declared');
  });

  test('disable stops the instance and flips the flag', async () => {
    const { useCase, triggers, calls } = build();
    const row = useCase.create({
      orgId: 'org1',
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: { threadId: 'th1', agentId: 'ag1' },
      actor: ACTOR,
    });
    await useCase.disable({ orgId: 'org1', instanceId: row.id });
    expect(calls.calls).toContain(`trigger.stop:${row.id}`);
    expect(triggers.find('org1', row.id)?.enabled).toBe(false);
  });

  test('delete stops enabled instance and removes the row', async () => {
    const { useCase, triggers, calls } = build();
    const row = useCase.create({
      orgId: 'org1',
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: { threadId: 'th1', agentId: 'ag1' },
      actor: ACTOR,
    });
    await useCase.delete({ orgId: 'org1', instanceId: row.id });
    expect(calls.calls).toContain(`trigger.stop:${row.id}`);
    expect(triggers.find('org1', row.id)).toBeNull();
  });

  test('enable restarts a disabled instance', async () => {
    const { useCase, calls } = build();
    const row = useCase.create({
      orgId: 'org1',
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: { threadId: 'th1', agentId: 'ag1' },
      enabled: false,
      actor: ACTOR,
    });
    expect(calls.calls).toEqual([]);
    await useCase.enable({ orgId: 'org1', instanceId: row.id });
    expect(calls.calls).toEqual([`trigger.start:${row.id}`]);
  });
});
