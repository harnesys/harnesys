import { afterEach, describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import { THRESHOLD_SUMMARY_NAME } from '../constants.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compileOrThrow } from './compile.ts';
import { type GraphOpts, startGraph } from './graph.ts';
import { messageSourceOf, type SourcedMessage } from './message-source.ts';

const ECHO: ToolDefinition = {
  name: 'echo',
  description: 'echo back',
  input: { type: 'object', properties: {} },
  execute: () => 'done',
};

const MODELS: ModelsPort = {
  get: async () =>
    ({
      name: 'prov',
      driver: 'openai-compatible',
      apiUrl: 'http://127.0.0.1:9/v1',
      enabled: true,
      model: { name: 'main-model', context_length: 1000 },
    }) as never,
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

function stopSse(content: string): Response {
  return sseResponse([
    JSON.stringify({
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'main-model',
      choices: [{ index: 0, delta: { role: 'assistant', content } }],
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

function lengthSse(content: string): Response {
  return sseResponse([
    JSON.stringify({
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'main-model',
      choices: [{ index: 0, delta: { role: 'assistant', content } }],
    }),
    JSON.stringify({
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'main-model',
      choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
    }),
  ]);
}

function toolCallSse(content: string, calls: Array<{ id: string; name: string }>): Response {
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
            content,
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: '{}' },
            })),
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

function baseAgent(): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'prov', model: 'main-model' },
    budget: { maxSteps: 20, policy: 'error' },
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

function compactionAgent(): AgentDefinition {
  return {
    ...baseAgent(),
    compaction: {
      name: THRESHOLD_SUMMARY_NAME,
      spec: { thresholdRatio: 0.8, protectRecentRatio: 0.1, auto: true },
    },
  };
}

function mockFetch(responder: (requestIndex: number) => Response): void {
  let requestIndex = 0;
  globalThis.fetch = Object.assign(async () => responder(requestIndex++), {
    preconnect: () => {},
  });
}

async function runGraph(
  agent: AgentDefinition,
  state: InMemoryRuntimeState,
  opts?: Partial<GraphOpts>,
): Promise<Event[]> {
  const events: Event[] = [];
  for await (const ev of startGraph({
    agent,
    input: null,
    state,
    models: MODELS,
    toolRegistry: new Map([[ECHO.name, ECHO]]),
    plan: compileOrThrow(agent),
    toolMessages: 'barrier',
    agents: { resolve: () => undefined },
    ...opts,
  } as GraphOpts)) {
    events.push(ev);
  }
  return events;
}

async function messagesOf(state: InMemoryRuntimeState): Promise<Array<Record<string, unknown>>> {
  const snap = await state.load();
  const messages = snap?.state.messages;
  return Array.isArray(messages) ? (messages as Array<Record<string, unknown>>) : [];
}

function eventsOfType(events: Event[], type: string): Event[] {
  return events.filter((ev) => ev.type === type);
}

describe('engine message provenance', () => {
  test('a tool-call run stamps user, assistant and parallel tool messages', async () => {
    mockFetch((i) =>
      i === 0
        ? toolCallSse('', [
            { id: 'call1', name: 'echo' },
            { id: 'call2', name: 'echo' },
          ])
        : stopSse('done'),
    );
    const state = new InMemoryRuntimeState('thread-1');
    const events = await runGraph(baseAgent(), state, { input: 'hello' });
    const messages = await messagesOf(state);

    const userEvent = eventsOfType(events, 'user.message')[0] as Event;
    expect(userEvent).toBeDefined();
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg?.src).toEqual({
      runId: userEvent.runId,
      seq: userEvent.sequence,
      engSeq: userEvent.sequence,
      kind: 'user',
    });

    const completions = eventsOfType(events, 'model.completed');
    expect(completions).toHaveLength(2);
    for (const completion of completions) {
      const meta = completion.metadata as Record<string, unknown>;
      const assistant = messages.find(
        (m) =>
          m.role === 'assistant' &&
          (typeof meta.text === 'string'
            ? m.content === meta.text
            : Array.isArray(m.toolCalls) && m.toolCalls.length > 0),
      );
      expect(assistant).toBeDefined();
      expect(assistant?.src).toEqual({
        runId: completion.runId,
        seq: completion.sequence,
        engSeq: completion.sequence,
        kind: 'assistant',
      });
    }
    const withCalls = messages.find(
      (m) => m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0,
    );
    expect(withCalls).toBeDefined();

    const toolCommitted = events.filter(
      (ev) =>
        (ev.type === 'tool.completed' || ev.type === 'tool.failed') &&
        typeof (ev.metadata as Record<string, unknown>).toolCallId === 'string',
    );
    expect(toolCommitted).toHaveLength(2);
    for (const ev of toolCommitted) {
      const meta = ev.metadata as Record<string, unknown>;
      const toolMsg = messages.find((m) => m.role === 'tool' && m.toolCallId === meta.toolCallId);
      expect(toolMsg).toBeDefined();
      expect(toolMsg?.src).toEqual({
        runId: ev.runId,
        seq: ev.sequence,
        engSeq: ev.sequence,
        kind: 'tool',
        toolCallId: meta.toolCallId,
      });
    }
    const sources = toolCommitted.map((ev) => (ev as Event).sequence);
    expect(new Set(sources).size).toBe(2);
  });

  test('inputRecorded user messages are stamped null', async () => {
    mockFetch(() => stopSse('done'));
    const state = new InMemoryRuntimeState('thread-2');
    const events = await runGraph(baseAgent(), state, {
      input: 'second',
      inputRecorded: true,
    });
    const messages = await messagesOf(state);
    expect(events.some((ev) => ev.type === 'user.message')).toBe(false);
    const userMsg = messages.find((m) => m.role === 'user' && m.content === 'second');
    expect(userMsg).toBeDefined();
    expect(userMsg?.src).toBeNull();
  });

  test('the memory nudge message is stamped null', async () => {
    mockFetch((i) => stopSse(i === 0 ? 'first' : 'second'));
    const agent: AgentDefinition = {
      ...baseAgent(),
      memoryPolicy: { enforce: true, minSteps: 1, maxNudges: 1 },
    };
    const state = new InMemoryRuntimeState('thread-3');
    const events = await runGraph(agent, state, { input: 'hello' });
    expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
    const messages = await messagesOf(state);
    const nudge = messages.find(
      (m) => m.role === 'user' && String(m.content).startsWith('[memory]'),
    );
    expect(nudge).toBeDefined();
    expect(nudge?.src).toBeNull();
  });

  test('the output-limit continuation message is stamped null', async () => {
    mockFetch((i) => (i === 0 ? lengthSse('part') : stopSse('rest')));
    const agent: AgentDefinition = {
      ...baseAgent(),
      generation: { context: { lengthCutContinuations: 2 } },
    };
    const state = new InMemoryRuntimeState('thread-4');
    const events = await runGraph(agent, state, { input: 'hello' });
    expect(events.some((ev) => ev.type === 'model.continued')).toBe(true);
    const messages = await messagesOf(state);
    const continuation = messages.find(
      (m) => m.role === 'user' && String(m.content).startsWith('[output-limit]'),
    );
    expect(continuation).toBeDefined();
    expect(continuation?.src).toBeNull();
  });

  test('the compaction anchor is stamped with the compaction.completed commit', async () => {
    mockFetch((i) =>
      i === 0
        ? toolCallSse('x'.repeat(3200), [{ id: 'call1', name: 'echo' }])
        : stopSse(i === 1 ? 'summary text' : 'final'),
    );
    const state = new InMemoryRuntimeState('thread-5');
    await state.commit(
      {
        sessionId: 'thread-5',
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
    const events = await runGraph(compactionAgent(), state, { input: null });
    expect(events.some((ev) => ev.type === 'compaction.started')).toBe(true);
    const completed = eventsOfType(events, 'compaction.completed')[0] as Event;
    expect(completed).toBeDefined();
    const messages = await messagesOf(state);
    const anchor = messages.find((m) => m.kind === 'compaction') as SourcedMessage | undefined;
    expect(anchor).toBeDefined();
    expect(anchor?.src).toEqual({
      runId: completed.runId,
      seq: completed.sequence,
      engSeq: completed.sequence,
    });
    expect(messageSourceOf(anchor)).toEqual(anchor?.src);
  });
});
