import { describe, expect, test } from 'bun:test';
import { AddonException } from '../../../domain/addons/errors.ts';
import {
  ACTOR,
  AGENT_ID,
  build,
  ORG,
  OTHER_THREAD_ID,
  STRANGER_AGENT_ID,
  TARGET,
  THREAD_ID,
} from './manage-instance.fakes.ts';

describe('ManageTriggerInstanceUseCase', () => {
  test('creates instance and starts it when enabled', async () => {
    const { useCase, triggers, calls } = build();
    const row = await useCase.create({
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

  test('rejects create when addon is disabled', async () => {
    const { useCase } = build(false);
    await expect(
      useCase.create({
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'feed',
        label: 'Feed',
        config: {},
        actor: ACTOR,
      }),
    ).rejects.toThrow(AddonException);
  });

  test('rejects undeclared trigger kind', async () => {
    const { useCase } = build();
    await expect(
      useCase.create({
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'ghost',
        label: 'Ghost',
        config: {},
        actor: ACTOR,
      }),
    ).rejects.toThrow('not declared');
  });

  test('rejects target pointing at a missing thread', async () => {
    const { useCase } = build();
    await expect(
      useCase.create({
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'feed',
        label: 'Feed',
        config: {},
        target: { threadId: OTHER_THREAD_ID, agentId: AGENT_ID },
        actor: ACTOR,
      }),
    ).rejects.toThrow('target.threadId not found');
  });

  test('rejects target agent outside the thread', async () => {
    const { useCase } = build();
    await expect(
      useCase.create({
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'feed',
        label: 'Feed',
        config: {},
        target: { threadId: THREAD_ID, agentId: STRANGER_AGENT_ID },
        actor: ACTOR,
      }),
    ).rejects.toThrow('not a thread member');
  });

  test('disable stops the instance and flips the flag', async () => {
    const { useCase, triggers, calls } = build();
    const row = await useCase.create({
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
    const row = await useCase.create({
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
    const row = await useCase.create({
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

  test('patch accepts retargeting the same instance to its own thread', async () => {
    const { useCase, triggers } = build();
    const row = await useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: TARGET,
      actor: ACTOR,
    });
    await useCase.patch(ORG, row.id, { targetJson: JSON.stringify(TARGET) });
    expect(JSON.parse(triggers.find(ORG, row.id)?.targetJson ?? '{}')).toMatchObject({
      threadId: THREAD_ID,
    });
  });
});
