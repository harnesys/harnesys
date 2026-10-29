import { describe, expect, test } from 'bun:test';
import type { HookPayload } from '../../domain/hook.ts';
import type { HookRuntimeCtx } from './bus.ts';
import { runHookHandler } from './executors.ts';

function payload(): HookPayload {
  return {
    event: 'Stop',
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

type DelegateAgent = (agentId: string, prompt: string) => Promise<string>;

function ctxWith(delegateAgent: DelegateAgent | undefined): HookRuntimeCtx {
  return {
    cwd: '/tmp',
    projectDir: '/tmp',
    envBase: {},
    ...(delegateAgent === undefined ? {} : { delegateAgent }),
  };
}

const vars = { pluginRoot: '/tmp', pluginData: '/tmp', projectDir: '/tmp' };

describe('agent hook handler', () => {
  test('ok:true verdict produces no effects', async () => {
    const result = await runHookHandler(
      { type: 'agent', agentId: 'reviewer', prompt: 'review' },
      payload(),
      ctxWith(async () => '{"ok":true}'),
      vars,
    );
    expect(result.effects).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  test('ok:false verdict blocks with the reason', async () => {
    const result = await runHookHandler(
      { type: 'agent', agentId: 'reviewer', prompt: 'review' },
      payload(),
      ctxWith(async () => '{"ok":false,"reason":"not good"}'),
      vars,
    );
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({ kind: 'block', reason: 'not good' });
  });

  test('non json answer becomes context', async () => {
    const result = await runHookHandler(
      { type: 'agent', agentId: 'reviewer', prompt: 'review' },
      payload(),
      ctxWith(async () => 'plain text answer'),
      vars,
    );
    expect(result.effects[0]).toEqual({ kind: 'context', text: 'plain text answer' });
  });

  test('missing delegate runtime produces a diagnostic', async () => {
    const result = await runHookHandler(
      { type: 'agent', agentId: 'reviewer', prompt: 'review' },
      payload(),
      ctxWith(undefined),
      vars,
    );
    expect(result.effects).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('hook_failed');
  });

  test('missing agentId produces a diagnostic', async () => {
    const result = await runHookHandler(
      { type: 'agent', prompt: 'review' },
      payload(),
      ctxWith(async () => '{"ok":true}'),
      vars,
    );
    expect(result.diagnostics[0]?.code).toBe('hook_failed');
  });

  test('ok:false without reason produces a diagnostic', async () => {
    const result = await runHookHandler(
      { type: 'agent', agentId: 'reviewer', prompt: 'review' },
      payload(),
      ctxWith(async () => '{"ok":false}'),
      vars,
    );
    expect(result.effects).toHaveLength(0);
    expect(result.diagnostics[0]?.code).toBe('hook_invalid_output');
  });
});
