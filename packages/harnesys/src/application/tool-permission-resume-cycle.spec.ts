import { afterEach, describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compileOrThrow } from './compile.ts';
import { type GraphOpts, startGraph } from './graph.ts';

const MODELS: ModelsPort = {
  get: async () =>
    ({
      name: 'main-model',
      driver: 'openai-compatible',
      apiUrl: 'http://127.0.0.1:9/v1',
      enabled: true,
      model: { name: 'main-model', context_length: 128000 },
    }) as never,
};

const exec = { count: 0 };
const SPAWN: ToolDefinition = {
  name: 'spawn_thing',
  description: 'side effect',
  operations: ['process'],
  input: { type: 'object', properties: {} },
  execute: () => {
    exec.count += 1;
    return 'ran';
  },
};

const PERMISSIONS: PermissionMap = { process: 'ask' };

function agentOf(): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'prov', model: 'main-model' },
    budget: { maxSteps: 50, policy: 'error' },
    graph: {
      nodes: {
        start: { type: 'core:start' },
        think: {
          type: 'llm:generate',
          prompt: 'main',
          messages: '$state.messages',
          tools: ['spawn_thing'],
        },
        act: { type: 'tool:call', calls: '$output.toolCalls', concurrency: 'parallel' },
        end: { type: 'core:end' },
      },
      edges: [
        { from: 'start', to: 'think' },
        { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
        { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
        { from: 'think', to: 'end' },
        { from: 'act', to: 'think' },
      ],
    },
  };
}

const originalFetch = globalThis.fetch;
let modelCalls = 0;
let callSeq = 0;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function installFetch(mode: 'always-tool' | 'tool-then-stop'): void {
  modelCalls = 0;
  callSeq = 0;
  globalThis.fetch = Object.assign(
    async () => {
      modelCalls += 1;
      if (mode === 'always-tool' || modelCalls === 1) {
        callSeq += 1;
        return sseResponse([
          JSON.stringify({
            id: 'c1',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'main-model',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: `call_${callSeq}`,
                      type: 'function',
                      function: { name: 'spawn_thing', arguments: '{}' },
                    },
                  ],
                },
              },
            ],
          }),
          JSON.stringify({
            id: 'c1',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'main-model',
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
          }),
        ]);
      }
      return sseResponse([
        JSON.stringify({
          id: 'c1',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'main-model',
          choices: [{ index: 0, delta: { role: 'assistant', content: 'done' } }],
        }),
        JSON.stringify({
          id: 'c1',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'main-model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }),
      ]);
    },
    { preconnect: () => {} },
  );
}

async function run(state: InMemoryRuntimeState, opts: Partial<GraphOpts> = {}): Promise<Event[]> {
  const agent = agentOf();
  const events: Event[] = [];
  for await (const ev of startGraph({
    agent,
    input: 'go',
    state,
    models: MODELS,
    toolRegistry: new Map([[SPAWN.name, SPAWN]]),
    plan: compileOrThrow(agent),
    toolMessages: 'barrier',
    permissions: PERMISSIONS,
    paths: { cwd: '/private/var/folders/9n/rd8dcm_j16g_hg2pv661mn3w0000gn/T/opencode' },
    agents: { resolve: () => undefined },
    ...opts,
  })) {
    events.push(ev);
  }
  return events;
}

function interrupts(events: Event[]): Event[] {
  return events.filter((ev) => ev.type === 'interrupt.triggered');
}

function meta(ev: Event): Record<string, unknown> {
  return (ev.metadata ?? {}) as Record<string, unknown>;
}

async function resume(state: InMemoryRuntimeState, ask: Event, payload: unknown): Promise<Event[]> {
  const snap = await state.load();
  return run(state, {
    startNodeId: snap?.cursor.interrupt?.nodeId,
    outputHint: snap?.cursor.interrupt?.output ?? null,
    resumePayload: payload,
    resumeInterruptId: String(meta(ask).interruptId ?? ''),
  });
}

describe('permission park/resume cycle', () => {
  test('once: approved call executes exactly once after resume', async () => {
    installFetch('always-tool');
    exec.count = 0;
    const state = new InMemoryRuntimeState('session-1');
    const first = await run(state);
    const asks = interrupts(first);
    expect(asks).toHaveLength(1);
    expect(meta(asks[0] as Event).source).toBe('permission');
    expect(exec.count).toBe(0);
    const askInterruptId = String(meta(asks[0] as Event).interruptId ?? '');
    const second = await resume(state, asks[0] as Event, { approved: true, scope: 'once' });
    expect(exec.count).toBe(1);
    const moreAsks = interrupts(second);
    expect(meta(moreAsks[0] as Event).tool).toMatchObject({ toolCallId: 'call_2' });
    expect(String(meta(moreAsks[0] as Event).interruptId ?? '')).not.toBe(askInterruptId);
    expect(askInterruptId).not.toBe('');
  });

  test('run: grant survives repeated park/resume', async () => {
    installFetch('tool-then-stop');
    exec.count = 0;
    const state = new InMemoryRuntimeState('session-2');
    const first = await run(state);
    const ask1 = interrupts(first)[0] as Event;
    expect(ask1).toBeDefined();
    const second = await resume(state, ask1 as Event, { approved: true, scope: 'run' });
    expect(exec.count).toBe(1);
    expect(interrupts(second)).toHaveLength(0);
    expect(second.some((ev) => ev.type === 'run.completed')).toBe(true);
  });
});
