import { describe, expect, test } from 'bun:test';
import type { ToolCallBatch } from '../domain/agent-definition.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { executeToolCall, type ToolCallContext } from './tool-call.ts';

interface Trace {
  order: string[];
  store: { value?: string };
}

function makeTool(name: string, sideEffect: 'write' | 'read', trace: Trace): ToolDefinition {
  return {
    name,
    description: name,
    sideEffect,
    input: { type: 'object', properties: {} },
    execute: () => {
      trace.order.push(name);
      if (sideEffect === 'write') {
        trace.store.value = 'written';
      } else {
        trace.store.value = trace.store.value === undefined ? 'read-empty' : 'read-seen';
      }
      return { name };
    },
  };
}

function buildCtx(tools: ToolDefinition[], calls: unknown[]): ToolCallContext {
  const overrides: Partial<ToolCallContext> = {
    state: { calls, messages: [] },
    paths: { cwd: '/tmp', allow: [] },
    toolRegistry: new Map(tools.map((tool) => [tool.name, tool])),
    signal: new AbortController().signal,
    runId: 'run-1',
    nodeId: 'node-1',
    nodeExecutionId: 'exec-1',
    sessionId: 'session-1',
    hostMaxConcurrency: 8,
    toolMessages: 'barrier',
    messagesPath: 'messages',
  };
  return { ...overrides } as ToolCallContext;
}

const NODE: ToolCallBatch = {
  type: 'tool:call',
  calls: '$state.calls',
  concurrency: 'parallel',
  barrier: { policy: 'all' },
};

describe('executeToolCall batch ordering', () => {
  test('a batch with a mutating call runs in the model emission order, one at a time', async () => {
    const trace: Trace = { order: [], store: {} };
    const read = makeTool('read', 'read', trace);
    const write = makeTool('write', 'write', trace);
    const ctx = buildCtx(
      [read, write],
      [
        { name: 'read', args: {} },
        { name: 'write', args: {} },
        { name: 'read', args: {} },
      ],
    );
    await executeToolCall(NODE, ctx);
    expect(trace.order).toEqual(['read', 'write', 'read']);
    expect(trace.store.value).toBe('read-seen');
  });

  test('a write at index 0 is visible to a dependent call later in the same batch', async () => {
    const trace: Trace = { order: [], store: {} };
    const read = makeTool('read', 'read', trace);
    const write = makeTool('write', 'write', trace);
    const ctx = buildCtx(
      [read, write],
      [
        { name: 'write', args: {} },
        { name: 'read', args: {} },
      ],
    );
    await executeToolCall(NODE, ctx);
    expect(trace.order).toEqual(['write', 'read']);
    expect(trace.store.value).toBe('read-seen');
  });

  test('a pure-read batch runs every call', async () => {
    const trace: Trace = { order: [], store: { value: 'seed' } };
    const read = makeTool('read', 'read', trace);
    const ctx = buildCtx(
      [read],
      [
        { name: 'read', args: {} },
        { name: 'read', args: {} },
        { name: 'read', args: {} },
      ],
    );
    const result = await executeToolCall(NODE, ctx);
    expect(result.results).toHaveLength(3);
    expect(trace.order).toEqual(['read', 'read', 'read']);
  });
});
