import { describe, expect, test } from 'bun:test';
import { ACTOR, build, ORG, RejectingCalls, TARGET } from './manage-instance.fakes.ts';

describe('ManageTriggerInstanceUseCase config validation', () => {
  test('create rejects a config the descriptor forbids', async () => {
    const { useCase, triggers } = build(true, {
      configFields: [{ key: 'token', label: 'Token', type: 'text', required: true }],
    });
    await expect(
      useCase.create({
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'feed',
        label: 'Feed',
        config: { token: '' },
        target: TARGET,
        actor: ACTOR,
      }),
    ).rejects.toThrow('token: required');
    expect(triggers.list(ORG)).toEqual([]);
  });

  test('create fills descriptor defaults into the stored config', async () => {
    const { useCase } = build(true, {
      configFields: [{ key: 'tz', label: 'Tz', type: 'text', required: false, default: 'UTC' }],
    });
    const row = await useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Defaults',
      config: {},
      target: TARGET,
      actor: ACTOR,
    });
    expect(JSON.parse(row.configJson)).toEqual({ tz: 'UTC' });
  });

  test('patch validates the merged config and keeps current keys', async () => {
    const { useCase, triggers } = build(true, {
      configFields: [
        {
          key: 'token',
          label: 'Token',
          type: 'text',
          required: true,
          pattern: { regex: '^[a-z]+$', hint: 'lowercase letters only' },
        },
      ],
    });
    const row = await useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: { token: 'abc', note: 'keep me' },
      target: TARGET,
      actor: ACTOR,
    });
    await expect(
      useCase.patch(ORG, row.id, { configJson: JSON.stringify({ token: 'UPPER' }) }),
    ).rejects.toThrow('lowercase letters only');
    await useCase.patch(ORG, row.id, { configJson: JSON.stringify({ token: 'xyz' }) });
    const stored = JSON.parse(triggers.find(ORG, row.id)?.configJson ?? '{}');
    expect(stored).toEqual({ token: 'xyz', note: 'keep me' });
  });

  test('create rolls back the row when the addon rejects the start', async () => {
    const { useCase, triggers, calls } = build(true, undefined, new RejectingCalls());
    await expect(
      useCase.create({
        orgId: ORG,
        addonId: 'acme.tool',
        triggerId: 'feed',
        label: 'Feed',
        config: { cron: 'nonsense' },
        target: TARGET,
        actor: ACTOR,
      }),
    ).rejects.toThrow('invalid cron: "nonsense"');
    expect(triggers.list(ORG)).toEqual([]);
    expect(calls.calls.some((line) => line.startsWith('trigger.stop:'))).toBe(true);
  });

  test('enable reverts enabled when the addon rejects the start', async () => {
    const calls = new RejectingCalls();
    calls.reject = false;
    const { useCase, triggers } = build(true, undefined, calls);
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
    calls.reject = true;
    await expect(useCase.enable({ orgId: ORG, instanceId: row.id })).rejects.toThrow(
      'invalid cron',
    );
    expect(triggers.find(ORG, row.id)?.enabled).toBe(false);
  });

  test('patch disables the instance when the addon rejects the restart', async () => {
    const calls = new RejectingCalls();
    calls.reject = false;
    const { useCase, triggers } = build(true, undefined, calls);
    const row = await useCase.create({
      orgId: ORG,
      addonId: 'acme.tool',
      triggerId: 'feed',
      label: 'Feed',
      config: {},
      target: TARGET,
      actor: ACTOR,
    });
    calls.reject = true;
    await expect(
      useCase.patch(ORG, row.id, { configJson: JSON.stringify({ cron: 'nonsense' }) }),
    ).rejects.toThrow('invalid cron');
    expect(triggers.find(ORG, row.id)?.enabled).toBe(false);
  });
});
