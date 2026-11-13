import { describe, expect, test } from 'bun:test';
import { AddonException } from '../../../domain/addons/errors.ts';
import {
  FakeSchedules,
  FakeThreadAgents,
  FakeThreads,
  FakeWebhooks,
} from '../../schedules/schedule.use-case.fakes.ts';
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
const ORG = 'org1';
const THREAD_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_AGENT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_THREAD_ID = '44444444-4444-4444-8444-444444444444';

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
    orgId: ORG,
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
  const threads = new FakeThreads();
  const threadAgents = new FakeThreadAgents();
  threads.insert({
    id: THREAD_ID,
    orgId: ORG,
    title: 'Feed thread',
    kind: 'chat',
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: 't0',
    updatedAt: 't0',
    lastReadAt: 't0',
  });
  threadAgents.ensure(ORG, THREAD_ID, AGENT_ID);
  const useCase = new ManageTriggerInstanceUseCase(
    orgAddons,
    catalog,
    triggers,
    calls,
    new FakeAudit(),
    threads,
    threadAgents,
    new FakeSchedules(),
    new FakeWebhooks(),
    new NullLogger(),
  );
  return { useCase, triggers, calls, threads, threadAgents };
}

const TARGET = { threadId: THREAD_ID, agentId: AGENT_ID, modeId: 'plan' };

describe('ManageTriggerInstanceUseCase', () => {
  test('creates instance and starts it when enabled', () => {
    const { useCase, triggers, calls } = build();
    const row = useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: { url: 'https://acme.dev' },
      target: TARGET,
      actor: ACTOR,
    });
    expect(row.enabled).toBe(true);
    expect(triggers.find(ORG, row.id)?.label).toBe('Feed');
    expect(calls.calls).toContain(`trigger.start:${row.id}`);
  });

  test('rejects create when addon is disabled', () => {
    const { useCase } = build(false);
    expect(() =>
      useCase.create({
        orgId: ORG,
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
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'ghost',
        label: 'Ghost',
        config: {},
        actor: ACTOR,
      }),
    ).toThrow('not declared');
  });

  test('rejects target pointing at a missing thread', () => {
    const { useCase } = build();
    expect(() =>
      useCase.create({
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'feed',
        label: 'Feed',
        config: {},
        target: { threadId: OTHER_THREAD_ID, agentId: AGENT_ID },
        actor: ACTOR,
      }),
    ).toThrow('target.threadId not found');
  });

  test('rejects target agent outside the thread', () => {
    const { useCase } = build();
    expect(() =>
      useCase.create({
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'feed',
        label: 'Feed',
        config: {},
        target: { threadId: THREAD_ID, agentId: STRANGER_AGENT_ID },
        actor: ACTOR,
      }),
    ).toThrow('not a thread member');
  });

  test('disable stops the instance and flips the flag', async () => {
    const { useCase, triggers, calls } = build();
    const row = useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: TARGET,
      actor: ACTOR,
    });
    await useCase.disable({ orgId: ORG, instanceId: row.id });
    expect(calls.calls).toContain(`trigger.stop:${row.id}`);
    expect(triggers.find(ORG, row.id)?.enabled).toBe(false);
  });

  test('delete stops enabled instance and removes the row', async () => {
    const { useCase, triggers, calls } = build();
    const row = useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: TARGET,
      actor: ACTOR,
    });
    await useCase.delete({ orgId: ORG, instanceId: row.id });
    expect(calls.calls).toContain(`trigger.stop:${row.id}`);
    expect(triggers.find(ORG, row.id)).toBeNull();
  });

  test('enable restarts a disabled instance', async () => {
    const { useCase, calls } = build();
    const row = useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: TARGET,
      enabled: false,
      actor: ACTOR,
    });
    expect(calls.calls).toEqual([]);
    await useCase.enable({ orgId: ORG, instanceId: row.id });
    expect(calls.calls).toEqual([`trigger.start:${row.id}`]);
  });

  test('patch accepts retargeting the same instance to its own thread', () => {
    const { useCase, triggers } = build();
    const row = useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: TARGET,
      actor: ACTOR,
    });
    useCase.patch(ORG, row.id, { targetJson: JSON.stringify(TARGET) });
    expect(JSON.parse(triggers.find(ORG, row.id)?.targetJson ?? '{}')).toMatchObject({
      threadId: THREAD_ID,
    });
  });
});
