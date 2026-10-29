import { afterEach, describe, expect, test } from 'bun:test';
import { THRESHOLD_SUMMARY_NAME } from '../../constants.ts';
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { ModelBinding, ProviderConfig } from '../../ports/models.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import type { CompactionPassContext } from './run.ts';
import { compactForced, runSummaryPassIfDue } from './run.ts';

const TOOL_REGISTRY = new Map<string, ToolDefinition>();

function agentOf(spec: Record<string, unknown>): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: 'work' } },
    compaction: { name: THRESHOLD_SUMMARY_NAME, spec },
    graph: { nodes: { start: { type: 'core:start' } }, edges: [] },
  };
}

function bindingOf(contextLength?: number): ModelBinding {
  return {
    name: 'prov',
    driver: 'openai-compatible',
    apiUrl: 'http://127.0.0.1:9/v1',
    enabled: true,
    model: {
      name: 'main-model',
      ...(contextLength === undefined ? {} : { context_length: contextLength }),
    },
  };
}

function user(chars: number): unknown {
  return { role: 'user', content: 'a'.repeat(chars) };
}

function ctxOf(opts: {
  agent: AgentDefinition;
  binding?: ModelBinding;
  models?: ProviderConfig[];
  messages?: unknown[];
}): CompactionPassContext {
  return {
    agent: opts.agent,
    state: { messages: opts.messages ?? [] },
    sessionId: 'thread-1',
    binding: opts.binding ?? bindingOf(1000),
    models: opts.models ?? [],
    toolRegistry: TOOL_REGISTRY,
    signal: new AbortController().signal,
  };
}

async function collect(
  events: AsyncGenerator<{
    type: string;
    reason?: string;
    error?: string;
    message?: { model?: { provider: string; model: string }; content?: string };
  }>,
): Promise<Array<{ type: string; reason?: string; error?: string; message?: unknown }>> {
  const out: Array<{ type: string; reason?: string; error?: string; message?: unknown }> = [];
  for await (const ev of events) {
    out.push(ev as { type: string });
  }
  return out;
}

const originalFetch = globalThis.fetch;
function stubFetch(handler: () => Response): void {
  globalThis.fetch = Object.assign(async () => handler(), { preconnect: () => {} });
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
function summarySse(): Response {
  return sseResponse([
    JSON.stringify({
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'sum',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'SUMMARY TEXT' } }],
    }),
    JSON.stringify({
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'sum',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  ]);
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('runSummaryPassIfDue threshold evaluation', () => {
  test('missing context window yields a visible skip instead of silence', async () => {
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8 }),
      binding: bindingOf(),
      messages: [user(3600)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([{ type: 'skipped', reason: 'no-context-window' }]);
  });

  test('spec context window overrides a missing model window', async () => {
    const agent = agentOf({ thresholdRatio: 0.8 });
    agent.generation = { contextWindowTokens: 1000 };
    const ctx = ctxOf({
      agent,
      binding: bindingOf(),
      messages: [user(120)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([]);
  });

  test('agent context window override never exceeds the model window', async () => {
    const agent = agentOf({ thresholdRatio: 0.8 });
    agent.generation = { contextWindowTokens: 100000 };
    const ctx = ctxOf({
      agent,
      binding: bindingOf(1000),
      messages: [user(3000)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([{ type: 'skipped', reason: 'near-threshold' }]);
  });

  test('agent max tokens act as the output reserve', async () => {
    stubFetch(
      () =>
        new Response('{"error":{"message":"provider down"}}', {
          status: 500,
          headers: { 'retry-after-ms': '1' },
        }),
    );
    const reserved = agentOf({ thresholdRatio: 0.8, preCompactNote: false });
    reserved.generation = { maxTokens: 400 };
    const aboveThreshold = ctxOf({
      agent: reserved,
      binding: bindingOf(1000),
      messages: [user(120), user(2800), user(120)],
    });
    expect((await collect(runSummaryPassIfDue(aboveThreshold))).at(-1)?.type).toBe('failed');
    const plain = agentOf({ thresholdRatio: 0.8, preCompactNote: false });
    const belowThreshold = ctxOf({
      agent: plain,
      binding: bindingOf(1000),
      messages: [user(120), user(2800), user(120)],
    });
    expect(await collect(runSummaryPassIfDue(belowThreshold))).toEqual([{ type: 'pressure' }]);
  });

  test('pressure note fires when auto compaction is disabled', async () => {
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8, auto: false }),
      messages: [user(3000)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([{ type: 'pressure' }]);
  });

  test('below the threshold stays silent', async () => {
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8 }),
      messages: [user(120)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([]);
  });

  test('reserve reaching the window disables compaction with a visible reason', async () => {
    const agent = agentOf({ thresholdRatio: 0.8 });
    agent.generation = { maxTokens: 1000 };
    const ctx = ctxOf({
      agent,
      binding: bindingOf(1000),
      messages: [user(120)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([{ type: 'skipped', reason: 'invalid-output-reserve' }]);
  });

  test('near-threshold emits a note when enabled', async () => {
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8 }),
      messages: [user(3000)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([{ type: 'skipped', reason: 'near-threshold' }]);
  });

  test('preCompactNote false leaves the pressure note intact', async () => {
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8, preCompactNote: false }),
      messages: [user(3000)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([{ type: 'pressure' }]);
  });

  test('threshold is re-evaluated on every call, not once per run', async () => {
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8, preCompactNote: false }),
      messages: [user(3000)],
    });
    expect(await collect(runSummaryPassIfDue(ctx))).toEqual([{ type: 'pressure' }]);
    const grown = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8 }),
      messages: [user(3000)],
    });
    const events = await collect(runSummaryPassIfDue(grown));
    expect(events.at(-1)?.type).toBe('skipped');
  });

  test('resume state skips the pass entirely', async () => {
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8 }),
      messages: [user(3600)],
    });
    ctx.state.$resume = { answer: 1 };
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events).toEqual([{ type: 'skipped', reason: 'resume-pending' }]);
  });
});

describe('runSummaryPassIfDue failure and model choice', () => {
  test('summary stream failure yields a failed event instead of throwing', async () => {
    stubFetch(
      () =>
        new Response('{"error":{"message":"provider down"}}', {
          status: 500,
          headers: { 'retry-after-ms': '1' },
        }),
    );
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8 }),
      messages: [user(120), user(3600), user(120)],
    });
    const events = await collect(runSummaryPassIfDue(ctx));
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('failed');
  });

  test('summary model binding is used for the summary call', async () => {
    stubFetch(() => summarySse());
    const models: ProviderConfig[] = [
      {
        name: 'other',
        driver: 'openai-compatible',
        apiUrl: 'http://127.0.0.1:9/v1',
        enabled: true,
        models: [{ name: 'sum' }],
      },
    ];
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8, summaryModel: { provider: 'other', model: 'sum' } }),
      messages: [user(120), user(3600), user(120)],
    });
    ctx.models = models;
    const events = await collect(runSummaryPassIfDue(ctx));
    const completed = events.at(-1) as {
      type: string;
      message?: { model?: { provider: string; model: string }; content?: string };
    };
    expect(completed.type).toBe('completed');
    expect(completed.message?.model).toEqual({ provider: 'openai-compatible', model: 'other' });
    expect(completed.message?.content).toBe('SUMMARY TEXT');
  });

  test('summary model window caps the compaction window', async () => {
    stubFetch(
      () =>
        new Response('{"error":{"message":"provider down"}}', {
          status: 500,
          headers: { 'retry-after-ms': '1' },
        }),
    );
    const models: ProviderConfig[] = [
      {
        name: 'other',
        driver: 'openai-compatible',
        apiUrl: 'http://127.0.0.1:9/v1',
        enabled: true,
        models: [{ name: 'sum', context_length: 300 }],
      },
    ];
    const base = {
      thresholdRatio: 0.8,
      preCompactNote: false,
      summaryModel: { provider: 'other', model: 'sum' },
    };
    const capped = ctxOf({
      agent: agentOf(base),
      binding: bindingOf(1000),
      models,
      messages: [user(1000), user(120), user(120)],
    });
    expect((await collect(runSummaryPassIfDue(capped))).at(-1)?.type).toBe('failed');
    const uncapped = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8, preCompactNote: false }),
      binding: bindingOf(1000),
      messages: [user(1000), user(120), user(120)],
    });
    expect(await collect(runSummaryPassIfDue(uncapped))).toEqual([]);
  });

  test('manual pass without a configured port reports compaction_not_configured', async () => {
    const agent = agentOf({ thresholdRatio: 0.8 });
    agent.compaction = null;
    const ctx = ctxOf({ agent, messages: [user(3600)] });
    try {
      await collect(compactForced(ctx));
      throw new Error('expected compactForced to throw');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('compaction_not_configured');
    }
  });

  test('manual pass without a context window skips with a visible reason', async () => {
    const ctx = ctxOf({
      agent: agentOf({ thresholdRatio: 0.8 }),
      binding: bindingOf(),
      messages: [user(3600)],
    });
    const events = await collect(compactForced(ctx));
    expect(events).toEqual([{ type: 'skipped', reason: 'no-context-window' }]);
  });
});
