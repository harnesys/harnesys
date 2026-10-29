import { describe, expect, test } from 'bun:test';
import type { HookBinding, HookEventName, HookPayload } from '../../domain/hook.ts';
import { createHookBus, type HookRunReport, type HookRuntimeCtx } from './bus.ts';

function payload(event: HookEventName): HookPayload {
  return {
    event,
    session_id: 'session-1',
    run_id: 'run-1',
    agent_id: 'agent-1',
    thread_id: 'thread-1',
    cwd: '/tmp',
    permission_mode: 'default',
    source: 'startup',
    trigger: 'manual',
  };
}

function binding(
  id: string,
  event: HookEventName,
  effects:
    | { kind: 'block'; reason: string }[]
    | { kind: 'ask'; reason: string }[]
    | { kind: 'stop'; reason?: string }[]
    | { kind: 'remind'; text: string }[],
): HookBinding {
  return {
    id,
    origin: 'agent',
    event,
    handler: {
      type: 'inline',
      fn: () => effects,
    },
    vars: { pluginRoot: '/tmp', pluginData: '/tmp' },
  };
}

function ctx(reports: HookRunReport[]): HookRuntimeCtx {
  return {
    cwd: '/tmp',
    projectDir: '/tmp',
    envBase: {},
    report: (report) => reports.push(report),
  };
}

describe('hook bus', () => {
  test('folds block effect into the outcome', async () => {
    const bus = createHookBus({
      bindings: [binding('b1', 'PreToolUse', [{ kind: 'block', reason: 'denied' }])],
      ctx: ctx([]),
    });
    const outcome = await bus.emit('PreToolUse', payload('PreToolUse'));
    expect(outcome.blocked?.kind).toBe('block');
  });

  test('keeps ask effect for PreToolUse', async () => {
    const bus = createHookBus({
      bindings: [binding('b1', 'PreToolUse', [{ kind: 'ask', reason: 'confirm?' }])],
      ctx: ctx([]),
    });
    const outcome = await bus.emit('PreToolUse', payload('PreToolUse'));
    expect(outcome.effects.some((effect) => effect.kind === 'ask')).toBe(true);
  });

  test('keeps stop effect for Stop', async () => {
    const bus = createHookBus({
      bindings: [binding('b1', 'Stop', [{ kind: 'stop', reason: 'halt' }])],
      ctx: ctx([]),
    });
    const outcome = await bus.emit('Stop', payload('Stop'));
    expect(outcome.effects.some((effect) => effect.kind === 'stop')).toBe(true);
  });

  test('keeps remind effect in the folded outcome', async () => {
    const bus = createHookBus({
      bindings: [binding('b1', 'Stop', [{ kind: 'remind', text: 'save memory' }])],
      ctx: ctx([]),
    });
    const outcome = await bus.emit('Stop', payload('Stop'));
    expect(outcome.effects.some((effect) => effect.kind === 'remind')).toBe(true);
  });

  test('reports every binding run with status and duration', async () => {
    const reports: HookRunReport[] = [];
    const bus = createHookBus({
      bindings: [binding('b1', 'PreToolUse', [{ kind: 'block', reason: 'denied' }])],
      ctx: ctx(reports),
    });
    await bus.emit('PreToolUse', payload('PreToolUse'));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.hookId).toBe('b1');
    expect(reports[0]?.status).toBe('blocked');
    expect(reports[0]?.agentId).toBe('agent-1');
    expect(reports[0]?.runId).toBe('run-1');
  });

  test('reports failed status when the handler produced diagnostics', async () => {
    const reports: HookRunReport[] = [];
    const bus = createHookBus({
      bindings: [
        {
          id: 'b1',
          origin: 'agent',
          event: 'PreToolUse',
          handler: {
            type: 'inline',
            fn: () => {
              throw new Error('boom');
            },
          },
          vars: { pluginRoot: '/tmp', pluginData: '/tmp' },
        },
      ],
      ctx: ctx(reports),
    });
    await bus.emit('PreToolUse', payload('PreToolUse'));
    expect(reports[0]?.status).toBe('failed');
    expect(reports[0]?.errorCode).toBe('hook_failed');
  });

  test('a failing reporter does not break the bus', async () => {
    const bus = createHookBus({
      bindings: [binding('b1', 'PreToolUse', [])],
      ctx: {
        cwd: '/tmp',
        projectDir: '/tmp',
        envBase: {},
        report: () => {
          throw new Error('reporter down');
        },
      },
    });
    const outcome = await bus.emit('PreToolUse', payload('PreToolUse'));
    expect(outcome.effects).toHaveLength(0);
  });
});
