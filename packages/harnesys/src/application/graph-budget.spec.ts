import { describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import type { AgentBudget, AgentDefinition } from '../domain/agent-definition.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compileOrThrow } from './compile.ts';
import { type GraphOpts, startGraph } from './graph.ts';

const MODELS: ModelsPort = {
  get: async () => ({
    name: 'test',
    driver: 'openai-compatible',
    enabled: true,
    model: { name: 'test', context_length: 128000 },
  }),
};

const ECHO: ToolDefinition = {
  name: 'echo',
  description: 'echo back',
  input: { type: 'object', properties: {} },
  execute: () => 'done',
};

function agentOf(budget: AgentBudget): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'test', model: 'test' },
    budget,
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

async function run(
  state: InMemoryRuntimeState,
  agent: AgentDefinition,
  opts: Partial<GraphOpts> = {},
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

async function resumeWith(
  state: InMemoryRuntimeState,
  agent: AgentDefinition,
  ev: Event,
  payload: unknown,
): Promise<Event[]> {
  const snap = await state.load();
  return run(state, agent, {
    startNodeId: snap?.cursor.interrupt?.nodeId,
    outputHint: snap?.cursor.interrupt?.output ?? null,
    resumePayload: payload,
    resumeInterruptId: String(meta(ev).interruptId ?? ''),
  });
}

describe('budget approval', () => {
  test('parks the run with a dedup-safe interrupt id', async () => {
    const state = new InMemoryRuntimeState('session-1');
    const agent = agentOf({ maxSteps: 2, policy: 'ask' });
    const events = await run(state, agent);
    const stops = interrupts(events);
    expect(stops).toHaveLength(1);
    expect(meta(stops[0] as Event).source).toBe('budget');
    expect(meta(stops[0] as Event).kind).toBe('steps');
    expect(String(meta(stops[0] as Event).interruptId)).toMatch(/^budget\/.+\/1$/);
    expect(meta(stops[0] as Event).extendDefault).toBe(1);
    const snap = await state.load();
    expect(snap?.status).toBe('needs_input');
    expect(snap?.cursor.budget?.stops).toBe(1);
  });

  test('an approval extends the limit and the run continues', async () => {
    const state = new InMemoryRuntimeState('session-1');
    const agent = agentOf({ maxSteps: 2, policy: 'ask' });
    const first = await run(state, agent);
    const stop = interrupts(first)[0] as Event;
    const before = (await state.load())?.cursor.budget?.steps ?? 0;
    const second = await resumeWith(state, agent, stop, { approved: true, extend: 5 });
    const extended = second.find((ev) => ev.type === 'budget.extended');
    expect(extended).toBeDefined();
    expect(meta(extended as Event)).toMatchObject({ kind: 'steps', amount: 5 });
    expect(second.filter((ev) => ev.type === 'model.completed').length).toBeGreaterThan(0);
    const completion = second.find((ev) => ev.type === 'model.completed') as Event;
    expect(meta(completion).toolCalls).toBeDefined();
    const snap = await state.load();
    expect(snap?.cursor.budget?.extend).toEqual({ steps: 5 });
    expect(snap?.cursor.budget?.steps ?? 0).toBeGreaterThan(before);
  });

  test('an approval without an amount takes the default extension', async () => {
    const state = new InMemoryRuntimeState('session-1');
    const agent = agentOf({ maxSteps: 2, policy: 'ask' });
    const first = await run(state, agent);
    const stop = interrupts(first)[0] as Event;
    const second = await resumeWith(state, agent, stop, { approved: true });
    const extended = second.find((ev) => ev.type === 'budget.extended');
    expect(meta(extended as Event).amount).toBe(1);
    expect((await state.load())?.cursor.budget?.extend).toEqual({ steps: 1 });
  });

  test('two consecutive approvals get their own interrupt ids', async () => {
    const state = new InMemoryRuntimeState('session-1');
    const agent = agentOf({ maxSteps: 2, deadlineMs: 50, policy: 'ask' });
    const first = await run(state, agent);
    const firstStop = interrupts(first)[0] as Event;
    expect(meta(firstStop).kind).toBe('steps');
    await new Promise<void>((r) => setTimeout(r, 80));
    const second = await resumeWith(state, agent, firstStop, { approved: true, extend: 10 });
    const secondStop = interrupts(second)[0] as Event;
    expect(secondStop).toBeDefined();
    expect(meta(secondStop).kind).toBe('deadline');
    expect(meta(secondStop).interruptId).not.toBe(meta(firstStop).interruptId);
    const snap = await state.load();
    expect(snap?.cursor.budget?.stops).toBe(2);
    expect(snap?.cursor.budget?.extend).toEqual({ steps: 10 });
    const third = await resumeWith(state, agent, secondStop, { approved: true });
    const thirdStop = interrupts(third)[0] as Event;
    expect(thirdStop).toBeDefined();
    expect(meta(thirdStop).interruptId).not.toBe(meta(secondStop).interruptId);
    expect((await state.load())?.cursor.budget?.stops).toBe(3);
  });

  test('close now ends the run with the final report', async () => {
    const state = new InMemoryRuntimeState('session-1');
    const agent = agentOf({ maxSteps: 2, policy: 'ask' });
    const first = await run(state, agent);
    const stop = interrupts(first)[0] as Event;
    const second = await resumeWith(state, agent, stop, { approved: true, close: true });
    const failed = second.find((ev) => ev.type === 'run.failed');
    expect(failed).toBeDefined();
    expect(meta(failed as Event).code).toBe('budget_exceeded');
    expect(String(meta(failed as Event).text ?? '')).not.toBe('');
    const completions = second.filter((ev) => ev.type === 'model.completed');
    expect(completions).toHaveLength(1);
    expect(meta(completions[0] as Event).toolCalls).toBeUndefined();
  });

  test('close on exhaustion ends the run with a report instead of parking', async () => {
    const state = new InMemoryRuntimeState('session-1');
    const agent = agentOf({ maxSteps: 2, policy: 'ask', closeOnExhaustion: true });
    const events = await run(state, agent);
    expect(interrupts(events)).toHaveLength(0);
    expect(events.some((ev) => ev.type === 'budget.closing')).toBe(true);
    const failed = events.find((ev) => ev.type === 'run.failed');
    expect(failed).toBeDefined();
    expect(meta(failed as Event).code).toBe('budget_exceeded');
  });

  test('a denied approval cancels the run', async () => {
    const state = new InMemoryRuntimeState('session-1');
    const agent = agentOf({ maxSteps: 2, policy: 'ask' });
    const first = await run(state, agent);
    const stop = interrupts(first)[0] as Event;
    const snap = await state.load();
    const second = await run(state, agent, {
      startNodeId: snap?.cursor.interrupt?.nodeId,
      resumePayload: { approved: false },
      resumeInterruptId: String(meta(stop).interruptId ?? ''),
      rejected: true,
    });
    expect(second.some((ev) => ev.type === 'run.cancelled')).toBe(true);
  });
});

const CHILD: AgentDefinition = {
  id: 'child-1',
  prompts: { main: { instructions: 'work' } },
  model: { provider: 'test', model: 'test' },
  budget: { maxSteps: 50, policy: 'ask' },
  graph: {
    nodes: {
      start: { type: 'core:start' },
      think: { type: 'llm:generate', prompt: 'main', messages: '$state.messages' },
      end: { type: 'core:end' },
    },
    edges: [
      { from: 'start', to: 'think' },
      { from: 'think', to: 'end' },
    ],
  },
};

function parentAgent(budget: AgentBudget, spawns: unknown[]): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'test', model: 'test' },
    budget,
    state: { initial: { spawns } },
    graph: {
      nodes: {
        start: { type: 'core:start' },
        spawn: { type: 'control:spawn', calls: '$state.spawns', concurrency: 'parallel' },
        end: { type: 'core:end' },
      },
      edges: [
        { from: 'start', to: 'spawn' },
        { from: 'spawn', to: 'end' },
      ],
    },
  };
}

describe('tree budget', () => {
  test('children share the remaining budget and the parent absorbs their spend', async () => {
    const state = new InMemoryRuntimeState('session-1');
    const agent = parentAgent({ maxSteps: 20, policy: 'ask' }, [
      { agentId: 'child-1', input: 'a' },
      { agentId: 'child-1', input: 'b' },
    ]);
    const events: Event[] = [];
    for await (const ev of startGraph({
      agent,
      input: null,
      state,
      models: MODELS,
      toolRegistry: new Map([[ECHO.name, ECHO]]),
      plan: compileOrThrow(agent),
      toolMessages: 'barrier',
      agents: { resolve: (id) => (id === 'child-1' ? CHILD : undefined) },
    })) {
      events.push(ev);
    }
    const spawned = events.filter((ev) => ev.type === 'agent.spawned');
    expect(spawned).toHaveLength(2);
    expect(meta(spawned[0] as Event).quotaSteps).toBe(9);
    const snap = await state.load();
    expect(snap?.cursor.budget?.steps ?? 0).toBeGreaterThan(5);
  });
});
