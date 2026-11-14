import { describe, expect, test } from 'bun:test';
import { AddonDataPort } from '../addon-data.port.ts';
import {
  FakeAddonData,
  FakeAudit,
  FakeRegistry,
  FakeSecrets,
  FakeSupervisor,
  InMemoryBindings,
  InMemoryJobs,
  InMemoryOrgAddons,
  InMemoryTriggers,
  NoopCalls,
  NullLogger,
} from '../addons.fakes.ts';
import { UninstallAddonUseCase } from './uninstall.use-case.ts';

const ACTOR = { kind: 'user' as const, id: 'admin' };

function build() {
  const orgAddons = new InMemoryOrgAddons();
  const triggers = new InMemoryTriggers();
  const jobs = new InMemoryJobs();
  const bindings = new InMemoryBindings();
  const secrets = new FakeSecrets();
  const data = new FakeAddonData();
  const calls = new NoopCalls();
  const supervisor = new FakeSupervisor();
  const registry = new FakeRegistry();
  const useCase = new UninstallAddonUseCase(
    orgAddons,
    registry,
    supervisor,
    triggers,
    jobs,
    bindings,
    calls,
    secrets,
    data as AddonDataPort,
    new FakeAudit(),
    new NullLogger(),
  );
  orgAddons.upsert({
    orgId: 'org1',
    addonId: 'acme.tool',
    version: '1.0.0',
    enabled: true,
    grantsJson: '[]',
    grantsDigest: 'd',
    configJson: '{"region":"eu"}',
    health: 'running',
    lastError: null,
    createdAt: 't0',
    updatedAt: 't0',
  });
  triggers.create({
    id: 'inst1',
    orgId: 'org1',
    addonId: 'acme.tool',
    triggerId: 'feed',
    label: 'feed',
    configJson: '{}',
    createdByUserId: null,
    instructions: '',
    targetJson: '{}',
    enabled: true,
    createdAt: 't0',
    updatedAt: 't0',
  });
  jobs.upsert({
    orgId: 'org1',
    addonId: 'acme.tool',
    jobId: 'sync',
    nextRunAt: null,
    lastRunAt: null,
    lastStatus: null,
    enabled: true,
  });
  bindings.add({
    orgId: 'org1',
    addonId: 'acme.tool',
    connectionId: 'main',
    accountId: 'acc1',
    createdAt: 't0',
  });
  void secrets.set('org1', 'addon:org1:acme.tool:token', 's3cret');
  void secrets.set('org1', 'other:key', 'keep-me');
  return {
    useCase,
    orgAddons,
    triggers,
    jobs,
    bindings,
    secrets,
    data,
    calls,
    supervisor,
    registry,
  };
}

describe('UninstallAddonUseCase', () => {
  test('keep keeps org row, secrets and data, clears runtime state', async () => {
    const ctx = build();
    await ctx.useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      purgeData: false,
      actor: ACTOR,
    });
    const row = ctx.orgAddons.find('org1', 'acme.tool');
    expect(row?.enabled).toBe(false);
    expect(row?.configJson).toBe('{"region":"eu"}');
    expect(ctx.triggers.list('org1', 'acme.tool')).toEqual([]);
    expect(ctx.jobs.list('org1', 'acme.tool')).toEqual([]);
    expect(ctx.bindings.list('org1', 'acme.tool')).toEqual([]);
    expect(await ctx.secrets.get('org1', 'addon:org1:acme.tool:token')).toBe('s3cret');
    expect(ctx.data.removed).toEqual([]);
    expect(ctx.registry.events).toContain('deactivate:org1/acme.tool@1.0.0');
    expect(ctx.supervisor.stopped).toContain('org1/acme.tool');
    expect(ctx.secrets.deleted).toEqual([]);
  });

  test('purge removes row, addon secrets, data dir, bindings, triggers and jobs', async () => {
    const ctx = build();
    await ctx.useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      purgeData: true,
      actor: ACTOR,
    });
    expect(ctx.orgAddons.find('org1', 'acme.tool')).toBeNull();
    expect(ctx.triggers.list('org1', 'acme.tool')).toEqual([]);
    expect(ctx.jobs.list('org1', 'acme.tool')).toEqual([]);
    expect(ctx.bindings.list('org1', 'acme.tool')).toEqual([]);
    expect(ctx.secrets.deleted).toContain('org1/addon:org1:acme.tool:token');
    expect(await ctx.secrets.get('org1', 'other:key')).toBe('keep-me');
    expect(ctx.data.removed).toEqual(['org1/acme.tool']);
  });

  test('stops enabled trigger instances before removal', async () => {
    const ctx = build();
    await ctx.useCase.execute({
      orgId: 'org1',
      addonId: 'acme.tool',
      purgeData: true,
      actor: ACTOR,
    });
    expect(ctx.calls.calls).toContain('trigger.stop:inst1');
  });

  test('unknown addon is not found', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ orgId: 'org1', addonId: 'acme.other', purgeData: true, actor: ACTOR }),
    ).rejects.toThrow('not enabled');
  });
});
