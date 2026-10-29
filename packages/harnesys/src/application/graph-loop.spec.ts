import { afterEach, describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compileOrThrow } from './compile.ts';
import { type GraphOpts, startGraph } from './graph.ts';
import { NUDGE_AFTER_IDENTICAL_CALLS, STOP_AFTER_IDENTICAL_CALLS } from './loop-guard.ts';

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

const ECHO: ToolDefinition = {
  name: 'echo',
  description: 'echo back',
  input: { type: 'object', properties: {} },
  execute: () => 'done',
};

const originalFetch = globalThis.fetch;
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

function toolCallSse(argsJson: string): Response {
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
                id: 'call1',
                type: 'function',
                function: { name: 'echo', arguments: argsJson },
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

function stopSse(): Response {
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
}

function agentOf(): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'prov', model: 'main-model' },
    budget: { maxSteps: 60, policy: 'error' },
    graph: {
      nodes: {
        start: { type: 'core:start' },
        think: {
          type: 'llm:generate',
          prompt: 'main',
          messages: '$state.messages',
          tools: ['echo'],
        },
        act: { type: 'tool:call', calls: '$output.toolCalls', concurrency: 'parallel' },
        end: { type: 'core:end' },
      },
      edges: [
        { from: 'start', to: 'think' },
        { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
        { from: 'think', to: 'end' },
        { from: 'act', to: 'think' },
      ],
    },
  };
}

async function runWith(
  responder: (requestIndex: number) => Response,
): Promise<{ events: Event[]; bodies: string[] }> {
  const state = new InMemoryRuntimeState('session-1');
  const bodies: string[] = [];
  let requestIndex = 0;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(String(init?.body ?? ''));
    return responder(requestIndex++);
  }) as typeof fetch;
  const events: Event[] = [];
  for await (const ev of startGraph({
    agent: agentOf(),
    input: null,
    state,
    models: MODELS,
    toolRegistry: new Map([[ECHO.name, ECHO]]),
    plan: compileOrThrow(agentOf()),
    toolMessages: 'barrier',
    agents: { resolve: () => undefined },
  } as GraphOpts)) {
    events.push(ev);
  }
  return { events, bodies };
}

describe('loop guard in graph', () => {
  test('identical calls nudge every step and stop the run at the limit', async () => {
    const { events, bodies } = await runWith(() => toolCallSse('{"q":"x"}'));
    const loopNotes = bodies.filter((b) => b.includes('<loop>'));
    expect(loopNotes).toHaveLength(STOP_AFTER_IDENTICAL_CALLS - NUDGE_AFTER_IDENTICAL_CALLS);
    expect(loopNotes.at(-1)).toContain('stops the whole run');
    const exceeded = events.find((ev) => ev.type === 'loop.exceeded');
    expect(exceeded).toBeDefined();
    const meta = (exceeded as Event).metadata as Record<string, unknown>;
    expect(meta.tool).toBe('echo');
    expect(meta.repeats).toBe(STOP_AFTER_IDENTICAL_CALLS);
    const failed = events.find((ev) => ev.type === 'run.failed');
    const failMeta = (failed as Event).metadata as Record<string, unknown>;
    expect(failMeta.code).toBe('loop_exceeded');
  });

  test('legitimate varied calls do not trigger the guard', async () => {
    const { events, bodies } = await runWith((i) =>
      i < 6 ? toolCallSse(`{"q":"${i}"}`) : stopSse(),
    );
    expect(bodies.some((b) => b.includes('<loop>'))).toBe(false);
    expect(events.some((ev) => ev.type === 'loop.exceeded')).toBe(false);
    expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
  });
});
