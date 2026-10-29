import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import {
  type AgentDefinition,
  createRunClaimer,
  createRunEngine,
  createRunEventBus,
  createRunEventFeed,
  InMemoryRunEventStore,
  InMemoryRunLifecycleStore,
  type ModelsPort,
  NOOP_LOGGER,
  type PendingSessionEvent,
  type PermissionMap,
  type RunClaimer,
  type ToolDefinition,
} from 'harnesys';
import { CREATE_RUN_SNAPSHOTS_SQL } from '../org-sqlite/org-sql.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { createBranchSeed } from './branch-state-seed.ts';
import { MemoryThreads } from './prepare-org-target.fakes.ts';
import { SqliteRuntimeState } from './sqlite-runtime-state.adapter.ts';

export const THREAD_ID = 'thread-hitl';
export const CWD = '/private/var/folders/9n/rd8dcm_j16g_hg2pv661mn3w0000gn/T/opencode';
export const counts = { spawn: 0, deploy: 0 };

function tool(name: string, op: string, bump: () => void): ToolDefinition {
  return {
    name,
    description: 'side effect',
    operations: [op],
    input: { type: 'object', properties: {} },
    execute: () => {
      bump();
      return name;
    },
  };
}

const SPAWN = tool('spawn_thing', 'process', () => {
  counts.spawn += 1;
});
const DEPLOY = tool('deploy_thing', 'deploy', () => {
  counts.deploy += 1;
});

const PERMISSIONS: PermissionMap = { process: 'ask', deploy: 'ask' };

export function agentOf(): AgentDefinition {
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
          tools: ['spawn_thing', 'deploy_thing'],
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

export function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

function sse(chunks: string[]): Response {
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

function chunk(delta: object, finish?: string): string {
  return JSON.stringify({
    id: 'c1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'main-model',
    choices: [{ index: 0, delta, ...(finish ? { finish_reason: finish } : {}) }],
  });
}

function toolCallChunk(id: string, name: string, args: Record<string, unknown>): string {
  return JSON.stringify({
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
            { index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  });
}

export type ModelScript = Array<{ name: string; args?: Record<string, unknown> } | null>;

export function installModelScript(script: ModelScript): void {
  let step = 0;
  globalThis.fetch = Object.assign(
    async () => {
      const next = script[step];
      step += 1;
      if (!next) {
        return sse([chunk({ role: 'assistant', content: 'done' }, 'stop')]);
      }
      return sse([
        toolCallChunk(`call_${step}`, next.name, next.args ?? {}),
        chunk({}, 'tool_calls'),
      ]);
    },
    { preconnect: () => {} },
  );
}

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

const sqlite = new Database(':memory:');
sqlite.exec(CREATE_RUN_SNAPSHOTS_SQL);
const db = drizzle(sqlite, { schema });

export interface Stack {
  claimer: RunClaimer;
  lifecycle: InMemoryRunLifecycleStore;
  events: InMemoryRunEventStore;
}

export function snapshotStatus(runId: string): string | null {
  const row = sqlite.query('SELECT status FROM run_snapshots WHERE run_id = ?').get(runId) as {
    status: string;
  } | null;
  return row?.status ?? null;
}

export async function approve(
  stack: Stack,
  runId: string,
  askId: string,
  payload: unknown,
): Promise<void> {
  const rec = await stack.lifecycle.get(runId);
  if (rec?.status !== 'needs_input') {
    throw new Error(`run ${runId} is ${rec?.status ?? 'unknown'}, not needs_input`);
  }
  const answer = { type: 'hitl.answer', interruptId: askId, payload } as PendingSessionEvent;
  await stack.lifecycle.transition(runId, rec.leaseEpoch, {
    from: rec.status,
    to: 'queued',
    interruptId: null,
    waitFireAt: null,
    events: [answer],
  });
  stack.claimer.kick();
}

export function buildStack(): Stack {
  const events = new InMemoryRunEventStore();
  const lifecycle = new InMemoryRunLifecycleStore(events);
  const feed = createRunEventFeed({ events, lifecycle, bus: createRunEventBus() });
  const engine = createRunEngine({
    lifecycle,
    events,
    feed,
    instanceId: 'test-node',
    models: MODELS,
    toolRegistry: new Map([
      [SPAWN.name, SPAWN],
      [DEPLOY.name, DEPLOY],
    ]),
    toolMessages: 'ordered',
    agents: { resolve: () => undefined },
    logger: NOOP_LOGGER,
  });
  const threads = new MemoryThreads();
  const now = new Date().toISOString();
  threads.thread = {
    id: THREAD_ID,
    orgId: 'org-1',
    agentId: 'agent-1',
    originAgentId: 'agent-1',
    title: 't',
    kind: 'chat',
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
  };
  const branchSeed = createBranchSeed({
    orgId: 'org-1',
    sessions: new Map(),
    threads,
    events,
    lifecycle,
    stateFactory: (threadId, runId) => new SqliteRuntimeState(threadId, runId, db),
  });
  const claimer = createRunClaimer({
    lifecycle,
    engine,
    instanceId: 'test-node',
    targets: {
      resolve: (threadId, runId) =>
        branchSeed.seededRunState(threadId, runId ?? null).then((state) => ({
          state,
          agent: agentOf(),
          permissions: PERMISSIONS,
          paths: { cwd: CWD },
        })),
    },
  });
  return { claimer, lifecycle, events };
}
