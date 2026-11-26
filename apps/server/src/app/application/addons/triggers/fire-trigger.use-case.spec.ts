import { describe, expect, test } from 'bun:test';
import { AddonException } from '../../../domain/addons/errors.ts';
import {
  FakeDispatch,
  FakeMetrics,
  FakeRegistry,
  FakeTriggerWorkspace,
  InMemoryTriggers,
  NullLogger,
} from '../addons.fakes.ts';
import { buildTriggerScripts } from '../trigger-script.fakes.ts';
import { FireTriggerUseCase } from './fire-trigger.use-case.ts';
import { FireWindowTracker } from './trigger-limits.ts';

function instanceRow(id: string, triggerId = 'feed') {
  return {
    id,
    orgId: 'org1',
    addonId: 'acme.tool',
    triggerId,
    label: triggerId,
    configJson: '{}',
    instructions: '',
    targetJson: JSON.stringify({ threadId: 'th1', agentId: 'ag1' }),
    enabled: true,
    createdByUserId: null,
    createdAt: 't0',
    updatedAt: 't0',
  };
}

function build(limits?: Record<string, number>, target?: Record<string, unknown>) {
  const triggers = new InMemoryTriggers();
  triggers.create({
    ...instanceRow('inst1'),
    ...(target === undefined ? {} : { targetJson: JSON.stringify(target) }),
  });
  const registry = new FakeRegistry();
  registry.contributionsByOrg.set('org1', [
    {
      owner: { orgId: 'org1', addonId: 'acme.tool', version: '1.0.0' },
      contributionId: 'feed',
      family: 'trigger',
      descriptor: { kind: 'feed', limits: limits ?? {} },
    },
  ]);
  const dispatch = new FakeDispatch();
  const tracker = new FireWindowTracker();
  const scripts = buildTriggerScripts(triggers);
  const useCase = new FireTriggerUseCase(
    triggers,
    registry,
    dispatch,
    tracker,
    new FakeMetrics(),
    new FakeTriggerWorkspace(),
    scripts.useCase,
    new NullLogger(),
  );
  return { useCase, triggers, dispatch, tracker, scripts };
}

function fire(useCase: FireTriggerUseCase, runKey: string) {
  return useCase.execute({
    orgId: 'org1',
    addonId: 'acme.tool',
    instanceId: 'inst1',
    runKey,
    text: 'hello',
  });
}

describe('FireTriggerUseCase', () => {
  test('fires to run dispatch with target from instance', async () => {
    const { useCase, dispatch } = build();
    const result = await fire(useCase, 'k1');
    expect(result.outcome).toBe('fired');
    expect(dispatch.calls[0]).toMatchObject({ orgId: 'org1', threadId: 'th1', runKey: 'k1' });
  });

  test('deduplicates by runKey', async () => {
    const { useCase, dispatch } = build();
    await fire(useCase, 'k1');
    const second = await fire(useCase, 'k1');
    expect(second.outcome).toBe('suppressed');
    expect(dispatch.calls).toHaveLength(1);
  });

  test('suppresses foreign addon instance', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({
        orgId: 'org1',
        addonId: 'acme.other',
        instanceId: 'inst1',
        runKey: 'k1',
        text: 'hi',
      }),
    ).rejects.toThrow(AddonException);
  });

  test('suppresses disabled instance without dispatch', async () => {
    const { useCase, dispatch, triggers } = build();
    triggers.update('org1', 'inst1', { enabled: false });
    const result = await fire(useCase, 'k1');
    expect(result.outcome).toBe('suppressed');
    expect(dispatch.calls).toHaveLength(0);
  });

  test('applies perDay limit', async () => {
    const { useCase, dispatch } = build({ perDay: 1 });
    await fire(useCase, 'k1');
    const second = await fire(useCase, 'k2');
    expect(second.outcome).toBe('suppressed');
    expect(dispatch.calls).toHaveLength(1);
  });

  test('applies throttleSec limit', async () => {
    const { useCase, dispatch } = build({ throttleSec: 60 });
    await fire(useCase, 'k1');
    const second = await fire(useCase, 'k2');
    expect(second.outcome).toBe('suppressed');
    expect(dispatch.calls).toHaveLength(1);
  });

  test('applies maxBurst limit', async () => {
    const { useCase, dispatch } = build({ maxBurst: 2 });
    await fire(useCase, 'k1');
    await fire(useCase, 'k2');
    const third = await fire(useCase, 'k3');
    expect(third.outcome).toBe('suppressed');
    expect(dispatch.calls).toHaveLength(2);
  });

  test('propagates dispatch outcome', async () => {
    const { useCase, dispatch } = build();
    dispatch.outcome = 'busy';
    expect((await fire(useCase, 'k1')).outcome).toBe('busy');
    dispatch.outcome = 'failed';
    expect((await fire(useCase, 'k2')).outcome).toBe('failed');
  });

  test('suppresses instance without thread target', async () => {
    const triggers = new InMemoryTriggers();
    triggers.create({ ...instanceRow('inst1'), targetJson: '{}' });
    const registry = new FakeRegistry();
    const useCase = new FireTriggerUseCase(
      triggers,
      registry,
      new FakeDispatch(),
      new FireWindowTracker(),
      new FakeMetrics(),
      new FakeTriggerWorkspace(),
      buildTriggerScripts(triggers).useCase,
      new NullLogger(),
    );
    expect((await fire(useCase, 'k1')).outcome).toBe('suppressed');
  });
});

describe('FireTriggerUseCase agentless modes', () => {
  const scriptedTarget = (scripts: Record<string, unknown>) => ({
    threadId: 'th1',
    agentId: 'ag1',
    scripts,
  });

  test('never mode runs the script without dispatching', async () => {
    const { useCase, dispatch, scripts } = build(
      undefined,
      scriptedTarget({ acknowledged: true, agent: 'never', pre: { script: { command: 'do' } } }),
    );
    const result = await fire(useCase, 'k1');
    expect(result.outcome).toBe('script-only');
    expect(dispatch.calls).toHaveLength(0);
    expect(scripts.process.calls).toHaveLength(1);
    expect(scripts.runs.recorded[0]).toMatchObject({ stage: 'pre', runId: null, status: 'ok' });
  });

  test('conditional mode escalates a failing script to an agent run with diagnostics', async () => {
    const { useCase, dispatch, scripts } = build(
      undefined,
      scriptedTarget({
        acknowledged: true,
        agent: 'conditional',
        escalate: { onFailure: true },
        pre: { script: { command: 'do' } },
      }),
    );
    scripts.process.results.push({
      exitCode: 1,
      stdout: '',
      stderr: 'boom',
      durationMs: 1,
      timedOut: false,
      aborted: false,
    });
    const result = await fire(useCase, 'k1');
    expect(result.outcome).toBe('fired');
    expect(dispatch.calls[0]?.text).toContain('Pre-run script failed');
    expect(dispatch.calls[0]?.text).toContain('boom');
  });

  test('conditional quiet path runs the post script against the job result', async () => {
    const { useCase, dispatch, scripts } = build(
      undefined,
      scriptedTarget({
        acknowledged: true,
        agent: 'conditional',
        escalate: { onFailure: false, gate: { on: 'json', path: 'need', op: 'truthy' } },
        pre: { script: { command: 'do' } },
        post: { script: { command: 'report' }, when: 'always' },
      }),
    );
    scripts.process.results.push({
      exitCode: 0,
      stdout: '{"need":false}',
      stderr: '',
      durationMs: 1,
      timedOut: false,
      aborted: false,
    });
    const result = await fire(useCase, 'k1');
    expect(result.outcome).toBe('script-only');
    expect(dispatch.calls).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scripts.runs.recorded.some((row) => row.stage === 'post')).toBe(true);
  });

  test('agentless config without a pre script fails the schema and falls back to the classic fire', async () => {
    const { useCase, dispatch } = build(
      undefined,
      scriptedTarget({ acknowledged: true, agent: 'never' }),
    );
    expect((await fire(useCase, 'k1')).outcome).toBe('fired');
    expect(dispatch.calls).toHaveLength(1);
  });
});
