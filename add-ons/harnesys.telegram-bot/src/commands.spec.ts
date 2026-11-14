import { describe, expect, test } from 'bun:test';
import type { AddonContext } from '@harnesys/sdk';
import { type CommandMessage, handleCommand } from './commands.ts';

interface RunRow {
  runId: string;
  status: string;
  startedAt: string | null;
}

interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byModel: ModelUsage[];
}

interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  source: string;
}

interface FakeServices {
  bindings?: Array<{ channel: string; threadId: string }>;
  runs?: RunRow[];
  compact?: Record<string, unknown>;
  usage?: UsageSummary;
  skills?: SkillRow[];
  failOn?: string;
}

interface FakeHarness {
  ctx: AddonContext;
  sent: string[];
  cancelled: string[];
  logged: string[];
}

function fakeCtx(services: FakeServices): FakeHarness {
  const sent: string[] = [];
  const cancelled: string[] = [];
  const logged: string[] = [];
  const fail = (): Error => {
    if (services.failOn !== undefined) {
      throw new Error(`permission not granted: ${services.failOn}`);
    }
    return new Error('unexpected service call');
  };
  const partial: Partial<AddonContext> = {
    http: {
      fetch: async (params: { body: string }) => {
        const payload = JSON.parse(params.body) as { text?: string };
        if (typeof payload.text === 'string') {
          sent.push(payload.text);
        }
        return { status: 200, body: JSON.stringify({ ok: true, result: true }) };
      },
    },
    log: {
      error: async (message: string) => {
        logged.push(message);
      },
    },
    bindings: {
      channels: async () => services.bindings ?? [],
    },
    runs: {
      list: async () => {
        if (services.failOn === 'runs.list') {
          throw fail();
        }
        return services.runs ?? [];
      },
      cancel: async (params: { runId: string }) => {
        cancelled.push(params.runId);
        return { ok: true as const };
      },
    },
    threads: {
      compact: async () => {
        if (services.failOn === 'threads.compact') {
          throw fail();
        }
        return services.compact ?? { compacted: false };
      },
    },
    usage: {
      summary: async () => {
        if (services.failOn === 'usage.summary') {
          throw fail();
        }
        return services.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: [] };
      },
    },
    skills: {
      list: async () => {
        if (services.failOn === 'skills.list') {
          throw fail();
        }
        return services.skills ?? [];
      },
    },
  };
  return { ctx: partial as AddonContext, sent, cancelled, logged };
}

function command(text: string): CommandMessage {
  return { chatId: '100', topicId: null, text, channel: '100' };
}

describe('thread commands', () => {
  test('replies that the chat has no bound thread', async () => {
    const fake = fakeCtx({});
    const handled = await handleCommand(fake.ctx, command('/stats'));
    expect(handled).toBe(true);
    expect(fake.sent).toEqual(['This chat is not paired with a Harnesys thread yet.']);
  });

  test('/stop reports when nothing is running', async () => {
    const fake = fakeCtx({
      bindings: [{ channel: '100', threadId: 't-1' }],
      runs: [{ runId: 'run-old', status: 'completed', startedAt: '2026-01-01T00:00:00Z' }],
    });
    const handled = await handleCommand(fake.ctx, command('/stop'));
    expect(handled).toBe(true);
    expect(fake.cancelled).toEqual([]);
    expect(fake.sent).toEqual(['No active run in this chat.']);
  });

  test('/stop cancels the most recent active run and mentions the rest', async () => {
    const fake = fakeCtx({
      bindings: [{ channel: '100', threadId: 't-1' }],
      runs: [
        { runId: 'run-old', status: 'running', startedAt: '2026-01-01T00:00:00Z' },
        { runId: 'run-new', status: 'queued', startedAt: '2026-01-02T00:00:00Z' },
        { runId: 'run-done', status: 'completed', startedAt: '2026-01-03T00:00:00Z' },
      ],
    });
    await handleCommand(fake.ctx, command('/stop'));
    expect(fake.cancelled).toEqual(['run-new']);
    expect(fake.sent[0]).toContain('Stopped run run-new');
    expect(fake.sent[0]).toContain('1 other active run left untouched');
  });

  test('/compact reports tokens before and after', async () => {
    const fake = fakeCtx({
      bindings: [{ channel: '100', threadId: 't-1' }],
      compact: { compacted: true, tokensBefore: 12345, tokensAfter: 2345 },
    });
    await handleCommand(fake.ctx, command('/compact'));
    expect(fake.sent).toEqual(['Compacted: 12,345 → 2,345 tokens.']);
  });

  test('/compact reports the refusal reason', async () => {
    const fake = fakeCtx({
      bindings: [{ channel: '100', threadId: 't-1' }],
      compact: { compacted: false, reason: 'compaction is not configured' },
    });
    await handleCommand(fake.ctx, command('/compact'));
    expect(fake.sent).toEqual(['Not compacted: compaction is not configured']);
  });

  test('/stats formats totals and per-model lines', async () => {
    const fake = fakeCtx({
      bindings: [{ channel: '100', threadId: 't-1' }],
      usage: {
        inputTokens: 1200,
        outputTokens: 340,
        costUsd: 0.0125,
        byModel: [
          { model: 'model-a', inputTokens: 1000, outputTokens: 300, costUsd: 0.01 },
          { model: 'model-b', inputTokens: 200, outputTokens: 40, costUsd: 0.0025 },
        ],
      },
    });
    await handleCommand(fake.ctx, command('/stats'));
    const text = fake.sent[0] ?? '';
    expect(text).toContain('Tokens: 1,200 in / 340 out');
    expect(text).toContain('Cost: $0.0125');
    expect(text).toContain('By model:');
    expect(text).toContain('- model-a: 1,000 in / 300 out ($0.0100)');
    expect(text).toContain('- model-b: 200 in / 40 out ($0.0025)');
  });

  test('/skills lists skills or reports an empty list', async () => {
    const listed = fakeCtx({
      bindings: [{ channel: '100', threadId: 't-1' }],
      skills: [{ id: 's1', name: 'report', description: 'Builds reports', source: 'org' }],
    });
    await handleCommand(listed.ctx, command('/skills'));
    expect(listed.sent).toEqual(['Skills:\n- report — Builds reports']);

    const empty = fakeCtx({ bindings: [{ channel: '100', threadId: 't-1' }] });
    await handleCommand(empty.ctx, command('/skills'));
    expect(empty.sent).toEqual(['No skills available.']);
  });

  test('a failing service call logs and replies with an honest error', async () => {
    const fake = fakeCtx({
      bindings: [{ channel: '100', threadId: 't-1' }],
      failOn: 'usage.summary',
    });
    const handled = await handleCommand(fake.ctx, command('/stats'));
    expect(handled).toBe(true);
    expect(fake.sent[0]).toBe('Command failed: permission not granted: usage.summary');
    expect(fake.logged).toEqual(['telegram command failed']);
  });
});
