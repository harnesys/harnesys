import { describe, expect, test } from 'bun:test';
import type { AddonContext } from '@harnesys/sdk';
import {
  botCommands,
  type CommandMessage,
  commandsScope,
  formatCompact,
  formatSkills,
  formatUsage,
  handleCommand,
  isStartCommand,
  pickStoppableRun,
  threadForChannel,
} from './commands.ts';

interface SentMessage {
  method: string;
  payload: Record<string, unknown>;
}

interface FakeServices {
  bindings?: Array<{ channel: string; threadId: string }>;
  runs?: Array<{
    runId: string;
    status: string;
    startedAt: string | null;
    agentId: string | null;
  }>;
  cancelled?: Array<{ threadId: string; runId: string }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    byModel: Array<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }>;
  };
  skills?: Array<{ id: string; name: string; description: string | null; source: string }>;
  compact?: { compacted: false; reason?: string };
  failUsage?: boolean;
}

function makeContext(services: FakeServices): { ctx: AddonContext; sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  const log = {
    debug: async () => {},
    info: async () => {},
    warn: async () => {},
    error: async () => {},
  };
  const ctx: Partial<AddonContext> = {
    bindings: {
      channels: async () =>
        (services.bindings ?? []).map((binding) => ({
          provider: 'telegram',
          createdAt: '',
          ...binding,
        })),
    },
    runs: {
      dispatch: async () => ({ runId: 'r-dispatch' }),
      list: async () => services.runs ?? [],
      cancel: async (params: { threadId: string; runId: string }) => {
        services.cancelled?.push(params);
        return { ok: true as const };
      },
    },
    usage: {
      summary: async () => {
        if (services.failUsage === true) {
          throw new Error('usage service is down');
        }
        return services.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: [] };
      },
    },
    skills: {
      list: async () => services.skills ?? [],
    },
    threads: {
      create: async () => ({ threadId: 't-new' }),
      compact: async () => services.compact ?? { compacted: false },
    },
    log,
    http: {
      fetch: async (request: { url: string; body?: string }) => {
        const method = request.url.split('/').pop() ?? '';
        sent.push({ method, payload: request.body === undefined ? {} : JSON.parse(request.body) });
        return { status: 200, headers: {}, body: JSON.stringify({ ok: true, result: true }) };
      },
    },
  };
  return { ctx: ctx as AddonContext, sent };
}

function command(text: string, channel = '100'): CommandMessage {
  return { chatId: '100', topicId: null, messageId: 1, text, channel };
}

describe('pickStoppableRun', () => {
  test('ignores finished runs and returns null without active runs', () => {
    const runs = [
      { runId: 'r1', status: 'completed', startedAt: '2026-01-02T00:00:00Z' },
      { runId: 'r2', status: 'error', startedAt: '2026-01-03T00:00:00Z' },
    ];
    expect(pickStoppableRun(runs)).toBeNull();
    expect(pickStoppableRun([])).toBeNull();
  });

  test('picks the most recent active run across active statuses', () => {
    const runs = [
      { runId: 'r1', status: 'running', startedAt: '2026-01-02T00:00:00Z' },
      { runId: 'r2', status: 'queued', startedAt: '2026-01-03T00:00:00Z' },
      { runId: 'r3', status: 'waiting', startedAt: '2026-01-01T00:00:00Z' },
      { runId: 'r4', status: 'completed', startedAt: '2026-01-04T00:00:00Z' },
    ];
    expect(pickStoppableRun(runs)?.runId).toBe('r2');
  });

  test('treats a missing startedAt as the oldest', () => {
    const runs = [
      { runId: 'r1', status: 'running', startedAt: null },
      { runId: 'r2', status: 'running', startedAt: '2026-01-02T00:00:00Z' },
    ];
    expect(pickStoppableRun(runs)?.runId).toBe('r2');
  });
});

describe('threadForChannel', () => {
  const bindings = [
    { channel: '100', threadId: 'thread-base' },
    { channel: '200:42', threadId: 'thread-topic' },
  ];

  test('prefers the exact topic channel binding', () => {
    expect(threadForChannel(bindings, '200:42', '200')).toBe('thread-topic');
  });

  test('falls back to the base chat binding', () => {
    expect(threadForChannel(bindings, '100', '100')).toBe('thread-base');
    expect(threadForChannel(bindings, '200:77', '200')).toBeNull();
  });

  test('returns null when nothing is bound', () => {
    expect(threadForChannel([], '100', '100')).toBeNull();
    expect(threadForChannel(bindings, '300', '300')).toBeNull();
  });
});

describe('formatters', () => {
  test('formatUsage reports totals and per-model rows', () => {
    const text = formatUsage({
      inputTokens: 1500,
      outputTokens: 250,
      costUsd: 0.0123,
      byModel: [
        { model: 'glm-x', inputTokens: 1000, outputTokens: 200, costUsd: 0.01 },
        { model: 'glm-y', inputTokens: 500, outputTokens: 50, costUsd: 0.0023 },
      ],
    });
    expect(text).toContain('Input tokens: 1,500');
    expect(text).toContain('Output tokens: 250');
    expect(text).toContain('Cost: $0.0123');
    expect(text).toContain('- glm-x: 1,000 in / 200 out ($0.0100)');
  });

  test('formatUsage says so when nothing was recorded', () => {
    expect(formatUsage({ inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: [] })).toContain(
      'No usage recorded',
    );
  });

  test('formatSkills lists name, source and description', () => {
    expect(formatSkills([])).toContain('No skills');
    const text = formatSkills([
      { name: 'Reviewer', description: 'Reviews diffs', source: 'builtin' },
      { name: 'Scout', description: null, source: 'org' },
    ]);
    expect(text).toContain('- Reviewer (builtin): Reviews diffs');
    expect(text).toContain('- Scout (org)');
  });

  test('formatCompact reports token delta or the skip reason', () => {
    expect(formatCompact({ compacted: true, tokensBefore: 12000, tokensAfter: 3000 })).toContain(
      '12,000 → 3,000',
    );
    expect(formatCompact({ compacted: false, reason: 'thread is too short' })).toContain(
      'thread is too short',
    );
    expect(formatCompact({ compacted: false })).toContain('Nothing to compact');
  });
});

describe('command dispatch', () => {
  test('command names ignore the leading slash and the bot mention', () => {
    expect(isStartCommand('/start')).toBe(true);
    expect(isStartCommand('/start@GroupsBot')).toBe(true);
    expect(isStartCommand('/START')).toBe(true);
    expect(isStartCommand('/stats')).toBe(false);
  });

  test('registers the new commands for the group scope', () => {
    const names = botCommands().map((entry) => entry.command);
    for (const name of ['stop', 'stats', 'skills', 'compact']) {
      expect(names).toContain(name);
    }
    expect(commandsScope()).toEqual({ type: 'all_group_chats' });
  });

  test('/stats replies with the usage summary of the bound thread', async () => {
    const { ctx, sent } = makeContext({
      bindings: [{ channel: '100', threadId: 't-1' }],
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.001, byModel: [] },
    });
    expect(await handleCommand(ctx, command('/stats'), 'mention')).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('sendMessage');
    expect(String(sent[0]?.payload.text)).toContain('Cost: $0.0010');
  });

  test('/stop cancels the most recent active run and replies with it', async () => {
    const cancelled: Array<{ threadId: string; runId: string }> = [];
    const { ctx, sent } = makeContext({
      bindings: [{ channel: '100', threadId: 't-1' }],
      runs: [
        { runId: 'old', agentId: 'a1', status: 'running', startedAt: '2026-01-01T00:00:00Z' },
        { runId: 'new', agentId: 'a1', status: 'running', startedAt: '2026-01-02T00:00:00Z' },
      ],
      cancelled,
    });
    expect(await handleCommand(ctx, command('/stop'), 'commands')).toBe(true);
    expect(cancelled).toEqual([{ threadId: 't-1', runId: 'new' }]);
    expect(String(sent[0]?.payload.text)).toContain('Cancelled run new');
  });

  test('/stop replies honestly when no run is active', async () => {
    const cancelled: Array<{ threadId: string; runId: string }> = [];
    const { ctx, sent } = makeContext({
      bindings: [{ channel: '100', threadId: 't-1' }],
      runs: [
        { runId: 'done', agentId: 'a1', status: 'completed', startedAt: '2026-01-02T00:00:00Z' },
      ],
      cancelled,
    });
    await handleCommand(ctx, command('/stop'), 'always');
    expect(cancelled).toHaveLength(0);
    expect(String(sent[0]?.payload.text)).toContain('No active run');
  });

  test('thread commands reply honestly when the chat is unbound', async () => {
    const { ctx, sent } = makeContext({});
    for (const text of ['/stop', '/stats', '/skills', '/compact']) {
      sent.length = 0;
      expect(await handleCommand(ctx, command(text), 'mention')).toBe(true);
      expect(String(sent[0]?.payload.text)).toContain('not bound');
    }
  });

  test('/compact replies with the skip reason', async () => {
    const { ctx, sent } = makeContext({
      bindings: [{ channel: '100', threadId: 't-1' }],
      compact: { compacted: false, reason: 'thread is too short' },
    });
    await handleCommand(ctx, command('/compact'), 'mention');
    expect(String(sent[0]?.payload.text)).toContain('thread is too short');
  });

  test('a service failure replies with a short honest error', async () => {
    const { ctx, sent } = makeContext({
      bindings: [{ channel: '100', threadId: 't-1' }],
      failUsage: true,
    });
    await handleCommand(ctx, command('/stats'), 'mention');
    expect(String(sent[0]?.payload.text)).toContain('command failed');
    expect(String(sent[0]?.payload.text)).toContain('usage service is down');
  });

  test('unknown commands are not handled', async () => {
    const { ctx } = makeContext({});
    expect(await handleCommand(ctx, command('/nope'), 'mention')).toBe(false);
  });
});
