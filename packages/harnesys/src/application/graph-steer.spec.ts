import { describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import { compileOrThrow } from './compile.ts';
import type { GraphOpts } from './graph.ts';
import { startGraph } from './graph.ts';
import type { SteerMessage } from './graph-steer.ts';

interface CapturedRequest {
  messages: Array<{ role: string; content: unknown }>;
}

function sseChunk(delta: Record<string, unknown>, finish?: string): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'mock-model',
    choices: [{ index: 0, delta, finish_reason: finish ?? null }],
  })}\n\n`;
}

function mockModelServer(captured: CapturedRequest[]): { stop: () => void; url: URL } {
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const body = (await req.json()) as CapturedRequest;
      captured.push(body);
      const stream = [
        sseChunk({ role: 'assistant', content: 'ok' }),
        sseChunk({}, 'stop'),
        'data: [DONE]\n\n',
      ].join('');
      return new Response(stream, {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });
  return { stop: () => server.stop(true), url: server.url };
}

function steerStub(calls: { count: number }): () => Promise<SteerMessage[]> {
  return () => {
    calls.count += 1;
    if (calls.count === 1) {
      return Promise.resolve([{ text: 'steer me', origin: 'queue' }]);
    }
    return Promise.resolve([]);
  };
}

function agentOf(): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'mock', model: 'mock-model' },
    budget: { maxSteps: 50, policy: 'error' },
    graph: {
      nodes: {
        start: { type: 'core:start' },
        think: { type: 'llm:generate', prompt: 'main', messages: '$state.messages', tools: [] },
        think2: { type: 'llm:generate', prompt: 'main', messages: '$state.messages', tools: [] },
        end: { type: 'core:end' },
      },
      edges: [
        { from: 'start', to: 'think' },
        { from: 'think', to: 'think2' },
        { from: 'think2', to: 'end' },
      ],
    },
  };
}

async function run(steer: () => Promise<SteerMessage[]>): Promise<{
  events: Event[];
  state: InMemoryRuntimeState;
}> {
  const agent = agentOf();
  const models: ModelsPort = {
    get: async () =>
      ({
        name: 'mock',
        driver: 'openai-compatible',
        enabled: true,
        apiUrl: mockUrl,
        model: { name: 'mock-model', context_length: 4096 },
      }) as never,
  };
  const state = new InMemoryRuntimeState('session-1');
  const events: Event[] = [];
  const opts: GraphOpts = {
    agent,
    input: { text: 'hi' },
    state,
    models,
    toolRegistry: new Map(),
    paths: { cwd: '/private/var/folders/9n/rd8dcm_j16g_hg2pv661mn3w0000gn/T/opencode' },
    plan: compileOrThrow(agent),
    toolMessages: 'barrier',
    agents: { resolve: () => undefined },
    steerMessages: steer,
  };
  for await (const ev of startGraph(opts)) {
    events.push(ev);
  }
  return { events, state };
}

let mockUrl = '';
const captured: CapturedRequest[] = [];

describe('graph steering', () => {
  test('injects queued message at first model entry only', async () => {
    const server = mockModelServer(captured);
    mockUrl = `${server.url}/v1`;
    const steerCalls = { count: 0 };
    try {
      const { events, state } = await run(steerStub(steerCalls));
      expect(steerCalls.count).toBe(2);
      expect(captured).toHaveLength(2);
      const firstUserTexts = userTexts(captured[0]);
      expect(firstUserTexts).toContain('steer me');
      const secondUserTexts = userTexts(captured[1]);
      expect(secondUserTexts.filter((t) => t === 'steer me')).toHaveLength(1);
      const steered = events.filter(
        (ev) =>
          ev.type === 'user.message' && (ev.metadata as { text?: string }).text === 'steer me',
      );
      expect(steered).toHaveLength(1);
      const snap = await state.load();
      const messages = snap?.state.messages as Array<{
        role: string;
        content: string;
        origin?: string;
      }>;
      const steerMsgs = messages.filter((m) => m.role === 'user' && m.content === 'steer me');
      expect(steerMsgs).toHaveLength(1);
      expect(steerMsgs[0]?.origin).toBe('queue');
      expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
    } finally {
      server.stop();
    }
  });
});

function userTexts(request: CapturedRequest | undefined): string[] {
  return (request?.messages ?? []).filter((m) => m.role === 'user').map((m) => String(m.content));
}
