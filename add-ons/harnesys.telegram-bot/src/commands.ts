import type { AddonContext } from '@harnesys/sdk';
import { call } from './bot-api.ts';

export interface CommandMessage {
  chatId: string;
  topicId: string | null;
  text: string;
  channel: string;
}

const REGISTERED_COMMANDS = [
  { command: 'start', description: 'Pair this chat with Harnesys' },
  { command: 'help', description: 'Show the available commands' },
  { command: 'id', description: 'Show the chat and channel identifiers' },
  { command: 'stop', description: 'Stop the active run in this chat' },
  { command: 'compact', description: 'Compact the history of this chat thread' },
  { command: 'stats', description: 'Show token and cost usage of this chat' },
  { command: 'skills', description: 'List skills available to the agent' },
] as const;

const SET_COMMANDS_SCOPE = { type: 'all_private_chats' } as const;

const HELP = [
  '/start - pair this chat with Harnesys',
  '/help - show this list',
  '/id - show the chat and channel identifiers',
  '/stop - stop the active run in this chat',
  '/compact - compact the history of this chat thread',
  '/stats - show token and cost usage of this chat',
  '/skills - list skills available to the agent',
  '',
  'After pairing, any message is delivered to the paired thread agent',
  'and its replies come back here.',
].join('\n');

const UNAVAILABLE: Record<string, string> = {
  link: 'Identity linking is not available in this add-on yet.',
};

const NO_BOUND_THREAD = 'This chat is not paired with a Harnesys thread yet.';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting', 'needs_input']);

type ThreadCommand = (ctx: AddonContext, threadId: string) => Promise<string>;

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function botCommands(): Array<{ command: string; description: string }> {
  return REGISTERED_COMMANDS.map((entry) => ({ ...entry }));
}

export function commandsScope(): Record<string, string> {
  return { ...SET_COMMANDS_SCOPE };
}

function reply(ctx: AddonContext, message: CommandMessage, text: string): Promise<unknown> {
  return call(ctx, 'sendMessage', {
    chat_id: message.chatId,
    text,
    ...(message.topicId !== null ? { message_thread_id: Number(message.topicId) } : {}),
  });
}

export function commandNameOf(text: string): string {
  const [head] = text.trim().split(/\s+/);
  if (head === undefined) {
    return '';
  }
  const withoutMention = head.split('@')[0] ?? head;
  return withoutMention.replace(/^\//, '').toLowerCase();
}

export function isCommand(text: string): boolean {
  return text.trimStart().startsWith('/');
}

async function boundThreadId(ctx: AddonContext, message: CommandMessage): Promise<string | null> {
  const bindings = await ctx.bindings.channels('telegram');
  const binding = bindings.find((entry) => entry.channel === message.channel);
  return binding === undefined ? null : binding.threadId;
}

async function replyFailure(
  ctx: AddonContext,
  message: CommandMessage,
  error: unknown,
): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error);
  await ctx.log.error('telegram command failed', {
    command: commandNameOf(message.text),
    detail,
  });
  await reply(ctx, message, `Command failed: ${detail}`);
}

async function stopCommand(ctx: AddonContext, threadId: string): Promise<string> {
  const runs = await ctx.runs.list({ threadId });
  const startedMs = (run: { startedAt: string | null }): number =>
    run.startedAt === null ? 0 : Date.parse(run.startedAt);
  const active = runs
    .filter((run) => ACTIVE_RUN_STATUSES.has(run.status))
    .sort((a, b) => startedMs(b) - startedMs(a));
  const target = active[0];
  if (target === undefined) {
    return 'No active run in this chat.';
  }
  await ctx.runs.cancel({ threadId, runId: target.runId });
  const rest = active.length - 1;
  const suffix =
    rest > 0 ? ` (${rest} other active run${rest === 1 ? '' : 's'} left untouched)` : '';
  return `Stopped run ${target.runId}${suffix}.`;
}

async function compactCommand(ctx: AddonContext, threadId: string): Promise<string> {
  const result = await ctx.threads.compact({ threadId });
  if (result.compacted) {
    return `Compacted: ${formatNumber(result.tokensBefore)} → ${formatNumber(result.tokensAfter)} tokens.`;
  }
  return result.reason === undefined ? 'Not compacted.' : `Not compacted: ${result.reason}`;
}

async function statsCommand(ctx: AddonContext, threadId: string): Promise<string> {
  const summary = await ctx.usage.summary({ threadId });
  const lines = [
    `Tokens: ${formatNumber(summary.inputTokens)} in / ${formatNumber(summary.outputTokens)} out`,
    `Cost: ${formatCost(summary.costUsd)}`,
  ];
  if (summary.byModel.length > 0) {
    lines.push('', 'By model:');
    for (const entry of summary.byModel) {
      lines.push(
        `- ${entry.model}: ${formatNumber(entry.inputTokens)} in / ${formatNumber(entry.outputTokens)} out (${formatCost(entry.costUsd)})`,
      );
    }
  }
  return lines.join('\n');
}

async function skillsCommand(ctx: AddonContext, threadId: string): Promise<string> {
  const skills = await ctx.skills.list({ threadId });
  if (skills.length === 0) {
    return 'No skills available.';
  }
  const lines = ['Skills:'];
  for (const skill of skills) {
    lines.push(`- ${skill.name}${skill.description === null ? '' : ` — ${skill.description}`}`);
  }
  return lines.join('\n');
}

const THREAD_COMMANDS: Record<string, ThreadCommand> = {
  stop: stopCommand,
  compact: compactCommand,
  stats: statsCommand,
  skills: skillsCommand,
};

export async function handleCommand(ctx: AddonContext, message: CommandMessage): Promise<boolean> {
  const command = commandNameOf(message.text);
  if (command === '/start') {
    await reply(
      ctx,
      message,
      'This chat is paired with Harnesys. Send a message here and it goes to the paired thread agent; its replies come back through this bot.',
    );
    return true;
  }
  if (command === '/help') {
    await reply(ctx, message, HELP);
    return true;
  }
  if (command === '/id') {
    const parts = [`chat: ${message.chatId}`, `channel: ${message.channel}`];
    if (message.topicId !== null) {
      parts.push(`topic: ${message.topicId}`);
    }
    await reply(ctx, message, parts.join('\n'));
    return true;
  }
  const threadCommand = THREAD_COMMANDS[command];
  if (threadCommand !== undefined) {
    const threadId = await boundThreadId(ctx, message);
    if (threadId === null) {
      await reply(ctx, message, NO_BOUND_THREAD);
      return true;
    }
    try {
      await reply(ctx, message, await threadCommand(ctx, threadId));
    } catch (error) {
      await replyFailure(ctx, message, error);
    }
    return true;
  }
  const notice = UNAVAILABLE[command];
  if (notice !== undefined) {
    await reply(ctx, message, notice);
    return true;
  }
  return false;
}
