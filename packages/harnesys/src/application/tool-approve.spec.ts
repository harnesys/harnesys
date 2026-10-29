import { describe, expect, test } from 'bun:test';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { createHookBus } from './hooks/bus.ts';
import type { HookEmitCtx } from './hooks/emit-hook.ts';
import { runSingleToolCall } from './tool-approve.ts';
import type { ToolCallContext } from './tool-call.ts';

const TOOL: ToolDefinition = {
  name: 'echo',
  description: 'echo back',
  input: { type: 'object', properties: {} },
  execute: () => 'done',
};

function hookCtx(effect: { kind: 'ask'; reason: string }): HookEmitCtx {
  const bus = createHookBus({
    bindings: [
      {
        id: 'hook-1',
        origin: 'agent',
        event: 'PreToolUse',
        handler: { type: 'inline', fn: () => [effect] },
        vars: { pluginRoot: '/tmp', pluginData: '/tmp' },
      },
    ],
    ctx: { cwd: '/tmp', projectDir: '/tmp', envBase: {} },
  });
  return {
    bus,
    sessionId: 'session-1',
    runId: 'run-1',
    agentId: 'agent-1',
    threadId: 'thread-1',
    cwd: '/tmp',
    permissionMode: 'default',
  };
}

function ctx(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    state: {},
    output: undefined,
    paths: { cwd: '/tmp', allow: [] },
    toolRegistry: new Map([[TOOL.name, TOOL]]),
    signal: new AbortController().signal,
    runId: 'run-1',
    nodeId: 'node-1',
    nodeExecutionId: 'exec-1',
    sessionId: 'session-1',
    hooks: hookCtx({ kind: 'ask', reason: 'confirm the call' }),
    ...overrides,
  } as ToolCallContext;
}

const CALL = { id: 'call-1', name: 'echo', args: {} };

describe('hook ask effect', () => {
  test('parks the tool call with a permission interrupt', async () => {
    const promise = runSingleToolCall(CALL, ctx(), 0);
    await expect(promise).rejects.toBeInstanceOf(AskUserInterrupt);
    const error = await promise.then(
      () => undefined,
      (err: AskUserInterrupt) => err,
    );
    expect(error?.interruptId).toBe('perm/exec-1/0');
    expect(error?.source).toBe('permission');
  });

  test('approved resume runs the tool', async () => {
    const done = await runSingleToolCall(
      CALL,
      ctx({ resumePayload: { approved: true }, resumeInterruptId: 'perm/exec-1/0' }),
      0,
    );
    expect(done.result.result).toBe('done');
  });

  test('rejected resume does not run the tool', async () => {
    const done = await runSingleToolCall(
      CALL,
      ctx({ resumePayload: { approved: false }, resumeInterruptId: 'perm/exec-1/0' }),
      0,
    );
    expect(done.result.result).toBe('denied by user');
    expect(done.result.skipped).toBe(true);
  });

  test('sandbox denies the call instead of asking', async () => {
    const done = await runSingleToolCall(CALL, ctx({ sandbox: true }), 0);
    expect(done.result.isError).toBe(true);
    expect(String(done.result.result)).toContain('no interactive user here');
  });
});
