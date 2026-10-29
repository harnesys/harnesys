import { afterEach, describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import { THRESHOLD_SUMMARY_NAME } from '../constants.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compileOrThrow } from './compile.ts';
import { type GraphOpts, startGraph } from './graph.ts';

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

function toolCallSse(): Response {
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
            content: 'x'.repeat(3200),
            tool_calls: [
              {
                index: 0,
                id: 'call1',
                type: 'function',
                function: { name: 'echo', arguments: '{}' },
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

function agentOf(): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'prov', model: 'main-model' },
    budget: { maxSteps: 20, policy: 'error' },
    compaction: {
      name: THRESHOLD_SUMMARY_NAME,
      spec: { thresholdRatio: 0.8, protectRecentRatio: 0.1, auto: true },
    },
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
        { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
        { from: 'think', to: 'end' },
        { from: 'act', to: 'think' },
      ],
    },
  };
}

describe('compaction threshold per model call', () => {
  test('a run started below the threshold re-checks it on later steps', async () => {
    let call = 0;
    globalThis.fetch = Object.assign(
      async () => {
        call += 1;
        if (call === 1) {
          return toolCallSse();
        }
        return new Response('{"error":{"message":"provider down"}}', {
          status: 500,
          headers: { 'retry-after-ms': '1' },
        });
      },
      { preconnect: () => {} },
    );
    const state = new InMemoryRuntimeState('thread-1');
    await state.commit(
      {
        sessionId: 'thread-1',
        runId: 'run-1',
        definitionHash: '',
        planHash: '',
        sequence: 0,
        status: 'idle',
        runtimeVersion: 'test',
        initialInput: null,
        state: { messages: [{ role: 'user', content: 'a'.repeat(600) }] },
        cursor: { nodes: {} },
      },
      [],
      { kind: 'recorded', sequence: 0 },
    );
    const agent = agentOf();
    const events: Event[] = [];
    try {
      for await (const ev of startGraph({
        agent,
        input: null,
        state,
        models: {
          get: async () =>
            ({
              name: 'prov',
              driver: 'openai-compatible',
              apiUrl: 'http://127.0.0.1:9/v1',
              enabled: true,
              model: { name: 'main-model', context_length: 1000 },
            }) as never,
        } as ModelsPort,
        toolRegistry: new Map([[ECHO.name, ECHO]]),
        plan: compileOrThrow(agent),
        toolMessages: 'barrier',
        agents: { resolve: () => undefined },
      } satisfies GraphOpts)) {
        events.push(ev);
      }
    } catch {
      // the model call after the compaction failure fails the run; events above are recorded
    }
    const types = events.map((ev) => ev.type);
    const failedIndex = types.indexOf('compaction.failed');
    expect(failedIndex).toBeGreaterThan(-1);
    expect(
      types.slice(0, failedIndex).filter((type) => type.startsWith('compaction.')),
    ).toHaveLength(0);
    expect(types.filter((type) => type === 'compaction.failed')).toHaveLength(1);
    expect(call).toBeGreaterThanOrEqual(2);
    expect(types.indexOf('model.completed')).toBeLessThan(failedIndex);
  });
});
