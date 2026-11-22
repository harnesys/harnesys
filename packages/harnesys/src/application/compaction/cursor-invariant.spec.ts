import { afterEach, describe, expect, test } from 'bun:test';
import { InMemoryRunEventStore } from '../../adapters/in-memory-run-event-store.ts';
import { InMemoryRunLifecycleStore } from '../../adapters/in-memory-run-lifecycle-store.ts';
import { InMemoryRuntimeState } from '../../adapters/in-memory-runtime-state.ts';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { ModelsPort } from '../../ports/models.ts';
import type { PendingSessionEvent } from '../../ports/run-event-store.ts';
import type { SessionEvent } from '../../ports/session.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { compileOrThrow } from '../compile.ts';
import { type GraphOpts } from '../graph.ts';
import { projectCompacted } from '../llm.ts';
import { type MessageSource, messageSourceOf, stampMessageSource } from '../message-source.ts';
import { rebuildThreadMessages } from '../replay-thread-history.ts';
import {
  resolveAnchorCursor,
  restoreBoundaryLedger,
  runSegment,
  type SegmentEnv,
} from '../run-engine-segment.ts';
import { SYNTHETIC_TOOL_RESULT_ABANDONED } from '../tool-message.ts';
import { resolveCoveredBoundary } from './cursor.ts';
import { extendCutToToolResults, planCut } from './plan-cut.ts';

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

const LONG = 'x'.repeat(4000);
const SHORT = 'step';

interface Round {
  kind: 'tool' | 'stop';
  calls: number;
  long: boolean;
}

interface RunSpec {
  input: string | null;
  rounds: Round[];
  agent: AgentDefinition;
  seedFromJournal: boolean;
  unsourcedSeed: boolean;
  inputRecorded: boolean;
  resumeFromAsk: boolean;
  cancelViaToolCall?: number;
  cancelViaFetch?: number;
}

interface Scenario {
  name: string;
  runs: RunSpec[];
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundsOf(rng: () => number, count: number, forceLong: boolean): Round[] {
  const rounds: Round[] = [];
  for (let i = 0; i < count; i += 1) {
    const long = forceLong || i < 2 || rng() < 0.5;
    if (i === count - 1) {
      rounds.push({ kind: 'stop', calls: 0, long });
      continue;
    }
    rounds.push(
      rng() < 0.75
        ? { kind: 'tool', calls: 1 + Math.floor(rng() * 3), long }
        : { kind: 'stop', calls: 0, long },
    );
  }
  return rounds;
}

function baseAgent(): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'prov', model: 'main-model' },
    budget: { maxSteps: 60, policy: 'error' },
    compaction: {
      name: 'threshold-summary',
      spec: { thresholdRatio: 0.8, protectRecentRatio: 0.1, auto: true },
    },
    generation: { contextWindowTokens: 1000 },
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

function chunk(delta: Record<string, unknown>, finish?: string, usage?: unknown): string {
  return JSON.stringify({
    id: 'c1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'main-model',
    choices: [
      {
        index: 0,
        delta,
        ...(finish ? { finish_reason: finish } : {}),
        ...(usage ? { usage } : {}),
      },
    ],
  });
}

function toolCallSse(content: string, calls: number): Response {
  const deltas = [chunk({ role: 'assistant', content, tool_calls: [] })];
  for (let i = 0; i < calls; i += 1) {
    deltas.push(
      chunk({
        role: 'assistant',
        tool_calls: [
          {
            index: i,
            id: `call${i}`,
            type: 'function',
            function: { name: 'echo', arguments: '{}' },
          },
        ],
      }),
    );
  }
  deltas.push(chunk({}, 'tool_calls'));
  return sseResponse(deltas);
}

function stopSse(content: string): Response {
  return sseResponse([chunk({ role: 'assistant', content }), chunk({}, 'stop')]);
}

function summarySse(): Response {
  return sseResponse([
    chunk({ role: 'assistant', content: 'SUMMARY TEXT' }),
    chunk({}, 'stop', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }),
  ]);
}

function echoOf(controller: AbortController, cancelAt: { count?: number }): ToolDefinition {
  return {
    name: 'echo',
    description: 'echo back',
    input: { type: 'object', properties: {} },
    execute: () => {
      if (cancelAt.count !== undefined) {
        cancelAt.count -= 1;
        if (cancelAt.count <= 0) {
          controller.abort();
        }
      }
      return 'done';
    },
  };
}

function segmentEnv(
  lifecycle: InMemoryRunLifecycleStore,
  events: InMemoryRunEventStore,
): SegmentEnv {
  return {
    lifecycle,
    events,
    liveFlushMs: 0,
    journalBatch: 64,
    isLeaseLost: () => false,
    sleep: () => Promise.resolve(),
  };
}

async function seededState(
  threadId: string,
  runId: string,
  journal: SessionEvent[],
  stampCoords: boolean,
): Promise<InMemoryRuntimeState> {
  const state = new InMemoryRuntimeState(threadId);
  const coords: MessageSource[] = [];
  const messages = rebuildThreadMessages(journal, { messageSrcCoords: coords });
  for (let i = 0; i < messages.length; i += 1) {
    stampMessageSource(messages[i], stampCoords ? (coords[i] ?? null) : null);
  }
  await state.commit(
    {
      sessionId: threadId,
      runId,
      definitionHash: '',
      planHash: '',
      sequence: 0,
      status: 'idle',
      runtimeVersion: 'seed',
      initialInput: null,
      state: { messages },
      cursor: { nodes: {} },
    },
    [],
    { kind: 'recorded', sequence: 0 },
  );
  return state;
}

async function executeScenario(scenario: Scenario): Promise<{
  journal: SessionEvent[];
  messages: unknown[];
}> {
  const events = new InMemoryRunEventStore();
  const lifecycle = new InMemoryRunLifecycleStore(events);
  const threadId = `thread-${scenario.name}`;
  const journal: SessionEvent[] = [];
  let messages: unknown[] = [];
  for (const spec of scenario.runs) {
    const runId = `run-${journal.length}-${spec.input ?? 'resume'}`;
    const controller = new AbortController();
    const cancelAt: { count?: number } = {
      ...(spec.cancelViaToolCall !== undefined ? { count: spec.cancelViaToolCall } : {}),
    };
    let fetchIndex = 0;
    const script = spec.rounds.slice();
    globalThis.fetch = Object.assign(
      async (
        _url: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): Promise<Response> => {
        fetchIndex += 1;
        if (spec.cancelViaFetch !== undefined && fetchIndex === spec.cancelViaFetch) {
          controller.abort();
          throw new Error('aborted by test');
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as { tools?: unknown[] };
        if (!Array.isArray(body.tools) || body.tools.length === 0) {
          return summarySse();
        }
        const next = script.shift();
        if (!next) {
          return stopSse(SHORT);
        }
        return next.kind === 'tool'
          ? toolCallSse(next.long ? LONG : SHORT, next.calls)
          : stopSse(next.long ? LONG : SHORT);
      },
      { preconnect: () => {} },
    );
    const state = spec.seedFromJournal
      ? await seededState(threadId, runId, journal, !spec.unsourcedSeed)
      : new InMemoryRuntimeState(threadId);
    const initialEvents: PendingSessionEvent[] = spec.inputRecorded
      ? [{ type: 'user', text: spec.input ?? '' } as PendingSessionEvent]
      : [];
    await lifecycle.create(
      { runId, threadId, agentId: 'agent-1', agentName: 'Fuzz' },
      initialEvents,
    );
    const claimed = await lifecycle.claim(runId, 'spec', 60_000);
    if (!claimed) {
      throw new Error('claim failed');
    }
    const echo = echoOf(controller, cancelAt);
    const graphOpts: GraphOpts = {
      agent: spec.agent,
      input: spec.input,
      state,
      runId,
      models: MODELS,
      toolRegistry: new Map([[echo.name, echo]]),
      plan: compileOrThrow(spec.agent),
      toolMessages: 'barrier',
      agents: { resolve: () => undefined },
      signal: controller.signal,
      inputRecorded: spec.inputRecorded,
    };
    await runSegment(segmentEnv(lifecycle, events), runId, claimed.leaseEpoch, graphOpts);
    if (spec.resumeFromAsk) {
      const snap = await state.load();
      const interrupt = snap?.cursor.interrupt;
      const record = await lifecycle.get(runId);
      if (!interrupt || !record || record.status !== 'needs_input') {
        throw new Error('expected a budget ask interrupt');
      }
      const bumped = await lifecycle.transition(runId, record.leaseEpoch, {
        from: 'needs_input',
        to: 'running',
      });
      await runSegment(segmentEnv(lifecycle, events), runId, bumped.leaseEpoch, {
        ...graphOpts,
        input: null,
        inputRecorded: true,
        startNodeId: interrupt.nodeId,
        outputHint: interrupt.output ?? null,
        resumePayload: { approved: true, extend: 100 },
        resumeInterruptId: interrupt.interruptId,
      });
    }
    journal.length = 0;
    journal.push(...(await events.listByThread(threadId)));
    const snap = await state.load();
    messages = Array.isArray(snap?.state.messages) ? (snap?.state.messages as unknown[]) : [];
  }
  return { journal, messages };
}

function checkInvariant(scenario: string, journal: SessionEvent[], stateMessages: unknown[]): void {
  const coords: MessageSource[] = [];
  const seeded = rebuildThreadMessages(journal, { messageSrcCoords: coords });
  const live = projectCompacted(stateMessages as unknown[]).messages;
  const journalSeqByEng = new Map<string, number>();
  const eventByCoords = new Map<string, SessionEvent>();
  for (const ev of journal) {
    if (typeof ev.runId !== 'string' || typeof ev.seq !== 'number') {
      continue;
    }
    eventByCoords.set(`${ev.runId}:${ev.seq}`, ev);
    if (typeof ev.engSeq === 'number') {
      journalSeqByEng.set(`${ev.runId}:${ev.engSeq}`, ev.seq);
    }
  }
  const eventIndexByCoords = new Map<string, number>();
  for (let index = 0; index < journal.length; index += 1) {
    const event = journal[index];
    if (typeof event?.runId !== 'string' || typeof event.seq !== 'number') {
      continue;
    }
    eventIndexByCoords.set(`${event.runId}:${event.seq}`, index);
  }
  const coveredKeys = new Set<string>();
  for (const anchor of journal) {
    if (anchor.type !== 'compaction') {
      continue;
    }
    if (
      typeof anchor.coveredUntilRunId !== 'string' ||
      typeof anchor.coveredUntilSeq !== 'number'
    ) {
      continue;
    }
    const boundaryIndex = eventIndexByCoords.get(
      `${anchor.coveredUntilRunId}:${anchor.coveredUntilSeq}`,
    );
    if (boundaryIndex === undefined) {
      continue;
    }
    for (let index = 0; index <= boundaryIndex; index += 1) {
      const covered = journal[index];
      if (typeof covered?.runId !== 'string' || typeof covered.seq !== 'number') {
        continue;
      }
      coveredKeys.add(`${covered.runId}:${covered.seq}`);
    }
  }
  for (const message of live as Record<string, unknown>[]) {
    const src = messageSourceOf(message);
    if (src === null || src === undefined) {
      continue;
    }
    let seq: number | undefined;
    if (typeof src.engSeq === 'number' && src.runId) {
      seq = journalSeqByEng.get(`${src.runId}:${src.engSeq}`);
    } else if (src.runId) {
      seq = src.seq;
    }
    expect(seq, `${scenario}: no journal event for live src`).toBeDefined();
    const key = `${src.runId}:${seq}`;
    const index = coords.findIndex((c) => `${c.runId}:${c.seq}` === key);
    expect(index, `${scenario}: seeded context misses ${key}`).toBeGreaterThanOrEqual(0);
    const twin = seeded[index] as Record<string, unknown> | undefined;
    expect(String(twin?.content)).toBe(String(message.content));
  }
  const liveByEng = new Map<string, unknown>();
  const liveByCoords = new Map<string, unknown>();
  for (const message of live as Record<string, unknown>[]) {
    const src = messageSourceOf(message);
    if (!src || typeof src.runId !== 'string') {
      continue;
    }
    if (typeof src.engSeq === 'number') {
      liveByEng.set(`${src.runId}:${src.engSeq}`, message);
    }
    if (typeof src.seq === 'number') {
      liveByCoords.set(`${src.runId}:${src.seq}`, message);
    }
  }
  for (let i = 0; i < seeded.length; i += 1) {
    const c = coords[i];
    const twin = seeded[i] as Record<string, unknown> | undefined;
    if (!c || typeof c.seq !== 'number' || typeof c.runId !== 'string') {
      continue;
    }
    const key = `${c.runId}:${c.seq}`;
    const event = eventByCoords.get(key);
    if (twin?.kind === 'compaction') {
      continue;
    }
    if (twin?.role === 'tool' && twin.content === SYNTHETIC_TOOL_RESULT_ABANDONED) {
      continue;
    }
    if (
      event?.type === 'user' &&
      (stateMessages as Record<string, unknown>[]).some(
        (m) =>
          messageSourceOf(m) === null &&
          m.role === 'user' &&
          String(m.content) === String(twin?.content),
      )
    ) {
      continue;
    }
    const match =
      event && typeof event.engSeq === 'number'
        ? (liveByEng.get(`${c.runId}:${event.engSeq}`) ?? liveByCoords.get(key))
        : liveByCoords.get(key);
    if (match === undefined) {
      expect(coveredKeys.has(key), `${scenario}: seeded ${key} is neither live nor covered`).toBe(
        true,
      );
      continue;
    }
    expect(String((match as Record<string, unknown>).content)).toBe(String(twin?.content));
  }
  const emittedCalls = new Set<string>();
  for (const message of seeded as Record<string, unknown>[]) {
    if (Array.isArray(message.toolCalls)) {
      for (const call of message.toolCalls) {
        const id = String((call as { id?: unknown } | null)?.id ?? '');
        if (id) {
          emittedCalls.add(id);
        }
      }
    }
    if (message.role === 'tool') {
      const id = typeof message.toolCallId === 'string' ? message.toolCallId : '';
      expect(emittedCalls.has(id), `${scenario}: orphan tool result ${id} in the seeded tail`).toBe(
        true,
      );
    }
  }
}

function scenarioOf(seed: number): Scenario {
  const rng = mulberry32(seed);
  const kind = (seed - 1) % 9;
  const agent = baseAgent();
  const name = `fz${seed}`;
  const rounds = roundsOf(rng, 3 + Math.floor(rng() * 4), true);
  if (kind === 1) {
    agent.memoryPolicy = { enforce: true, minSteps: 1, maxNudges: 3 };
  }
  if (kind === 3) {
    agent.budget = { maxSteps: 2, policy: 'ask' };
  }
  if (kind === 8) {
    const seededAgent = baseAgent();
    return {
      name,
      runs: [
        {
          input: `warmup ${seed}`,
          rounds,
          agent,
          seedFromJournal: false,
          unsourcedSeed: false,
          inputRecorded: false,
          resumeFromAsk: false,
        },
        {
          input: `legacy ${seed}`,
          rounds: roundsOf(rng, 3 + Math.floor(rng() * 3), true),
          agent: seededAgent,
          seedFromJournal: true,
          unsourcedSeed: true,
          inputRecorded: false,
          resumeFromAsk: false,
        },
      ],
    };
  }
  const run: RunSpec = {
    input: `task ${seed}`,
    rounds,
    agent,
    seedFromJournal: false,
    unsourcedSeed: false,
    inputRecorded: false,
    resumeFromAsk: kind === 3,
  };
  if (kind === 5) {
    run.cancelViaToolCall = 2 + Math.floor(rng() * 3);
  }
  if (kind === 6) {
    run.cancelViaFetch = 2 + Math.floor(rng() * 3);
  }
  if (kind === 4 || kind === 7) {
    const secondAgent = baseAgent();
    if (kind === 7) {
      secondAgent.memoryPolicy = { enforce: true, minSteps: 1, maxNudges: 2 };
    }
    return {
      name,
      runs: [
        run,
        {
          input: `follow-up ${seed}`,
          rounds: roundsOf(rng, 3 + Math.floor(rng() * 3), true),
          agent: secondAgent,
          seedFromJournal: true,
          unsourcedSeed: false,
          inputRecorded: kind === 4,
          resumeFromAsk: false,
        },
      ],
    };
  }
  return { name, runs: [run] };
}

describe('compaction cursor invariant', () => {
  test('a forced tool run keeps the invariant at a tool-result boundary', async () => {
    const scenario: Scenario = {
      name: 'tool-boundary',
      runs: [
        {
          input: 'work',
          rounds: [
            { kind: 'tool', calls: 1, long: true },
            { kind: 'stop', calls: 0, long: true },
          ],
          agent: baseAgent(),
          seedFromJournal: false,
          unsourcedSeed: false,
          inputRecorded: false,
          resumeFromAsk: false,
        },
      ],
    };
    const { journal, messages } = await executeScenario(scenario);
    checkInvariant(scenario.name, journal, messages);
  });

  test('seed-from-journal matches the live projected context across 20 fuzz scenarios', async () => {
    let exactEngSeqAnchors = 0;
    let coordAnchors = 0;
    let degradedAnchors = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const scenario = scenarioOf(seed);
      const { journal, messages } = await executeScenario(scenario);
      checkInvariant(scenario.name, journal, messages);
      for (const ev of journal) {
        if (ev.type !== 'compaction') {
          continue;
        }
        if (ev.durable === false) {
          degradedAnchors += 1;
          expect(ev.unresolvedReason).toBeString();
        } else {
          expect(typeof ev.coveredUntilRunId).toBe('string');
          expect(typeof ev.coveredUntilSeq).toBe('number');
          if (typeof ev.coveredUntilEngSeq === 'number') {
            exactEngSeqAnchors += 1;
          } else {
            coordAnchors += 1;
          }
        }
      }
    }
    expect(exactEngSeqAnchors, 'engSeq-resolved anchors must occur').toBeGreaterThan(0);
    expect(coordAnchors, 'journal-coordinate anchors must occur in seeded runs').toBeGreaterThan(0);
    expect(degradedAnchors, 'degraded anchors must occur').toBeGreaterThan(0);
  });

  test('a legacy unresolved cursor breaks the invariant on a nudged thread', async () => {
    const scenario = scenarioOf(2);
    const { journal, messages } = await executeScenario(scenario);
    const legacy = journal.map((ev) =>
      ev.type === 'compaction'
        ? ({
            ...ev,
            coveredUntilThreadSeq: null,
            coveredUntilRunId: undefined,
            coveredUntilSeq: undefined,
          } as SessionEvent)
        : ev,
    );
    expect(legacy.some((ev) => ev.type === 'compaction')).toBe(true);
    expect(() => checkInvariant(`${scenario.name}-legacy`, legacy, messages)).toThrow();
  });
});

describe('compaction tool boundaries', () => {
  test('a tool-result cut boundary keeps seeded equal to live without an orphan result', () => {
    const messages: unknown[] = [
      { role: 'user', content: 'hello', src: { runId: 'r1', seq: 1, kind: 'user' } },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'echo' }],
        src: { runId: 'r1', seq: 2, kind: 'assistant' },
      },
      {
        role: 'tool',
        toolCallId: 'c1',
        name: 'echo',
        content: 'tool output',
        src: { runId: 'r1', seq: 3, kind: 'tool', toolCallId: 'c1' },
      },
      { role: 'user', content: 'next', src: { runId: 'r1', seq: 4, kind: 'user' } },
    ];
    const plan = planCut(messages, { protectTokens: 0, protectMessages: 1, afterIndex: -1 });
    expect(plan).not.toBeNull();
    const coveredUntil = extendCutToToolResults(messages, plan?.coveredUntil ?? -1);
    expect(coveredUntil).toBe(2);
    const boundary = resolveCoveredBoundary(messages, coveredUntil);
    expect(boundary?.kind).toBe('tool');
    expect(boundary?.toolCallId).toBe('c1');
    expect(boundary?.runId).toBe('r1');
    expect(boundary?.seq).toBe(3);
    const anchor = {
      role: 'assistant',
      kind: 'compaction',
      id: 'k1',
      content: 'SUMMARY',
      coveredFrom: 0,
      coveredUntil,
      reason: 'threshold',
      stats: { tokensBefore: 0, tokensAfter: 0, coveredCount: coveredUntil + 1 },
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const live = projectCompacted([...messages, anchor]).messages as Record<string, unknown>[];
    const journal = [
      { type: 'user', text: 'hello', runId: 'r1', seq: 1, threadSeq: 1 },
      {
        type: 'model.usage',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        text: '',
        toolCalls: [{ id: 'c1', name: 'echo' }],
        finishReason: 'tool-calls',
        runId: 'r1',
        seq: 2,
        threadSeq: 2,
      },
      {
        type: 'tool',
        phase: 'completed',
        toolCallId: 'c1',
        name: 'echo',
        output: 'tool output',
        runId: 'r1',
        seq: 3,
        threadSeq: 3,
      },
      { type: 'user', text: 'next', runId: 'r1', seq: 4, threadSeq: 4 },
      {
        type: 'compaction',
        id: 'k1',
        reason: 'threshold',
        coveredFrom: 0,
        coveredUntil: 2,
        tokensBefore: 0,
        tokensAfter: 0,
        summary: 'SUMMARY',
        coveredUntilRunId: boundary?.runId,
        coveredUntilSeq: boundary?.seq,
        coveredKind: boundary?.kind,
        coveredToolCallId: boundary?.toolCallId,
        runId: 'r1',
        seq: 5,
        threadSeq: 5,
      },
    ] as SessionEvent[];
    const seeded = rebuildThreadMessages(journal) as Record<string, unknown>[];
    const seededTail = seeded.filter((message) => message.kind !== 'compaction');
    const shape = (message: Record<string, unknown>) => ({
      role: message.role,
      content: message.content,
    });
    expect(seededTail.map(shape)).toEqual(live.map(shape));
    expect(seededTail.some((message) => message.role === 'tool')).toBe(false);
  });

  test('a tool.skipped repair boundary resolves to an exact cursor', () => {
    const journal = [
      {
        type: 'model.usage',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        text: 'work',
        runId: 'r1',
        seq: 1,
        engSeq: 5,
        threadSeq: 1,
      },
      {
        type: 'tool',
        phase: 'skipped',
        toolCallId: 'c1',
        name: 'echo',
        output: 'run ended before tool execution; no result recorded',
        runId: 'r1',
        seq: 2,
        engSeq: 6,
        threadSeq: 2,
      },
    ] as SessionEvent[];
    const ledger = restoreBoundaryLedger(journal);
    const anchor = {
      type: 'compaction',
      id: 'k1',
      reason: 'threshold',
      coveredFrom: 0,
      coveredUntil: 1,
      tokensBefore: 0,
      tokensAfter: 0,
      coveredUntilEngSeq: 6,
      coveredKind: 'tool',
      coveredToolCallId: 'c1',
    } as Extract<SessionEvent, { type: 'compaction' }>;
    resolveAnchorCursor(anchor, ledger, 'r1');
    expect(anchor.durable).not.toBe(false);
    expect(anchor.unresolvedReason).toBeUndefined();
    expect(anchor.coveredUntilRunId).toBe('r1');
    expect(anchor.coveredUntilSeq).toBe(2);
  });
});
