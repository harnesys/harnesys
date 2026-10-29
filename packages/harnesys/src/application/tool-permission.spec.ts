import { describe, expect, test } from 'bun:test';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { runSingleToolCall } from './tool-approve.ts';
import type { ToolCallContext } from './tool-call.ts';
import type { PermissionGateContext } from './tool-permission.ts';
import { applyPermissionGate, skippedGateResult } from './tool-permission.ts';

let executed = 0;

const TOOL: ToolDefinition = {
  name: 'probe',
  description: 'probe',
  input: { type: 'object', properties: {} },
  execute: () => {
    executed += 1;
    return 'done';
  },
  gate: () => ({ decision: 'ask' }),
};

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
    ...overrides,
  } as ToolCallContext;
}

const CALL = { id: 'call-1', name: 'probe', args: {} };

function gateCtx(extra: Partial<PermissionGateContext>): PermissionGateContext {
  return {
    nodeExecutionId: 'run-1:act:0',
    state: {},
    nodeId: 'act',
    ...extra,
  };
}

describe('permission resume matching', () => {
  test('matching perm id with approved true runs the tool', async () => {
    executed = 0;
    const done = await runSingleToolCall(
      CALL,
      ctx({ resumePayload: { approved: true }, resumeInterruptId: 'perm/exec-1/0' }),
      0,
    );
    expect(done.result.result).toBe('done');
    expect(executed).toBe(1);
  });

  test('perm id of another execution asks again', async () => {
    const promise = runSingleToolCall(
      CALL,
      ctx({ resumePayload: { approved: true }, resumeInterruptId: 'perm/exec-2/0' }),
      0,
    );
    await expect(promise).rejects.toBeInstanceOf(AskUserInterrupt);
  });

  test('batch resume id does not approve a permission gate', async () => {
    const promise = runSingleToolCall(
      CALL,
      ctx({ resumePayload: { approved: true }, resumeInterruptId: 'batch/exec-1/0' }),
      0,
    );
    await expect(promise).rejects.toBeInstanceOf(AskUserInterrupt);
  });

  test('perm id with different call index asks again', async () => {
    const promise = runSingleToolCall(
      CALL,
      ctx({ resumePayload: { approved: true }, resumeInterruptId: 'perm/exec-1/1' }),
      0,
    );
    await expect(promise).rejects.toBeInstanceOf(AskUserInterrupt);
  });

  test('approved payload without resume interrupt id asks again', async () => {
    const promise = runSingleToolCall(CALL, ctx({ resumePayload: { approved: true } }), 0);
    await expect(promise).rejects.toBeInstanceOf(AskUserInterrupt);
  });

  test('matching deny skips the tool', async () => {
    executed = 0;
    const done = await runSingleToolCall(
      CALL,
      ctx({ resumePayload: { approved: false }, resumeInterruptId: 'perm/exec-1/0' }),
      0,
    );
    expect(done.result.skipped).toBe(true);
    expect(executed).toBe(0);
  });

  test('rejected resume answers denied with the note instead of re-asking', async () => {
    executed = 0;
    const done = await runSingleToolCall(
      CALL,
      ctx({
        resumeInterruptId: 'perm/exec-1/0',
        resumeRejected: true,
        resumeNote: 'wrong file',
      }),
      0,
    );
    expect(done.result.result).toBe('denied by user: wrong file');
    expect(done.result.skipped).toBe(true);
    expect(executed).toBe(0);
  });
});

describe('skippedGateResult', () => {
  test('permission resume appends the note', () => {
    const done = skippedGateResult(
      CALL,
      gateCtx({ resumeInterruptId: 'perm/exec-1/0', resumeNote: 'wrong file' }),
    );
    expect(done.result.result).toBe('denied by user: wrong file');
    expect(done.result.isError).toBe(false);
    expect(done.result.skipped).toBe(true);
  });

  test('plain reject keeps the bare text without a note', () => {
    const done = skippedGateResult(CALL, gateCtx({}));
    expect(done.result.result).toBe('rejected by user');
  });
});

describe('applyPermissionGate rejected resume', () => {
  test('answers denied instead of re-asking', async () => {
    const gate = gateCtx({
      resumeInterruptId: 'perm/run-1:act:0/0',
      resumeRejected: true,
      resumeNote: 'not now',
    });
    const done = await applyPermissionGate({
      call: CALL,
      ctx: gate,
      idx: 0,
      operation: 'fs.write',
    });
    expect(done?.result.result).toBe('denied by user: not now');
    expect(gate.resumePayload).toBeUndefined();
  });

  test('matching approved false payload keeps the deny path with note', async () => {
    const gate = gateCtx({
      resumeInterruptId: 'perm/run-1:act:0/0',
      resumePayload: { approved: false },
      resumeNote: 'nope',
    });
    const done = await applyPermissionGate({
      call: CALL,
      ctx: gate,
      idx: 0,
      operation: 'fs.write',
    });
    expect(done?.result.result).toBe('denied by user: nope');
  });
});
