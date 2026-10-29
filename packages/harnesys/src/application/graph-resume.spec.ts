import { describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import { type Event, RUNTIME_VERSION, type Snapshot } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compileOrThrow } from './compile.ts';
import { startGraph } from './graph.ts';

function modelPort(calls: { count: number }): ModelsPort {
  return {
    get: async () => {
      calls.count += 1;
      return {
        name: 'test',
        driver: 'openai-compatible',
        enabled: true,
        model: { name: 'test', context_length: 128000 },
      };
    },
  };
}

function spyTool(calls: { count: number }): ToolDefinition {
  return {
    name: 'spy',
    description: 'spy tool',
    input: { type: 'object', properties: {} },
    execute: () => {
      calls.count += 1;
      return 'ok';
    },
  };
}

function agentOf(): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'test', model: 'test' },
    budget: { maxSteps: 50, policy: 'error' },
    graph: {
      nodes: {
        start: { type: 'core:start' },
        think: {
          type: 'llm:generate',
          prompt: 'main',
          messages: '$state.messages',
          tools: ['spy'],
        },
        act: { type: 'tool:call', name: 'spy', args: { q: 'x' } },
        end: { type: 'core:end' },
      },
      edges: [
        { from: 'start', to: 'think' },
        { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
        { from: 'think', to: 'end' },
        { from: 'act', to: 'end' },
      ],
    },
  };
}

function snapOf(state: Record<string, unknown>, sequence: number): Snapshot {
  return {
    sessionId: 'session-1',
    runId: 'run-1',
    definitionHash: 'def',
    planHash: 'plan',
    sequence,
    status: 'running',
    runtimeVersion: RUNTIME_VERSION,
    initialInput: null,
    state,
    cursor: {
      nodes: {
        think: { phase: 'recorded', nodeExecutionId: 'run-1:think:0' },
        act: { phase: 'executing', nodeExecutionId: 'run-1:act:0' },
      },
      budget: { steps: 1, tokens: 0, startedAt: Date.now() },
    },
  };
}

async function run(
  state: InMemoryRuntimeState,
  models: ModelsPort,
  tool: ToolDefinition,
): Promise<Event[]> {
  const agent = agentOf();
  const events: Event[] = [];
  for await (const ev of startGraph({
    agent,
    input: null,
    state,
    models,
    toolRegistry: new Map([[tool.name, tool]]),
    paths: { cwd: '/private/var/folders/9n/rd8dcm_j16g_hg2pv661mn3w0000gn/T/opencode' },
    plan: compileOrThrow(agent),
    toolMessages: 'barrier',
    agents: { resolve: () => undefined },
  })) {
    events.push(ev);
  }
  return events;
}

describe('graph resume from checkpoint', () => {
  test('replays the executing node from checkpoint', async () => {
    const toolCalls = { count: 0 };
    const tool = spyTool(toolCalls);
    const state = new InMemoryRuntimeState('session-1');
    const snap = snapOf({ messages: [{ role: 'user', content: 'hi' }] }, 3);
    state.hydrate(snap);
    const events = await run(state, modelPort({ count: 0 }), tool);
    expect(toolCalls.count).toBe(1);
    expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
    expect((await state.load())?.status).toBe('completed');
  });

  test('skips recorded model node on resume', async () => {
    const modelCalls = { count: 0 };
    const toolCalls = { count: 0 };
    const state = new InMemoryRuntimeState('session-1');
    const snap = snapOf(
      {
        messages: [
          { role: 'user', content: 'hi' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call1', name: 'spy', arguments: { q: 'x' } }],
          },
        ],
      },
      7,
    );
    state.hydrate(snap);
    const events = await run(state, modelPort(modelCalls), spyTool(toolCalls));
    expect(modelCalls.count).toBe(0);
    expect(toolCalls.count).toBe(1);
    expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
    expect(events.every((ev) => ev.sequence > 7)).toBe(true);
  });
});
