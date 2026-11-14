import type { AddonContext } from '@harnesys/sdk';
import { call } from './bot-api.ts';
import type { RoutingPolicy } from './routing.ts';

export interface CommandMessage {
  chatId: string;
  topicId: string | null;
  messageId: number | null;
  text: string;
  channel: string;
}

const REGISTERED_COMMANDS = [
  { command: 'start', description: 'Register this group with Harnesys' },
  { command: 'join', description: 'Register this group with Harnesys' },
  { command: 'help', description: 'Show the available commands' },
  { command: 'id', description: 'Show the chat, topic and channel identifiers' },
  { command: 'agent', description: 'Show the current routing setup' },
  { command: 'stop', description: 'Cancel the run the agent is working on' },
  { command: 'stats', description: 'Show token usage and cost for this thread' },
  { command: 'skills', description: 'Show the skills available to the agent' },
  { command: 'compact', description: 'Compact the thread history' },
] as const;

const SET_COMMANDS_SCOPE = { type: 'all_group_chats' } as const;

const HELP = [
  '/start or /join - register this group (the bot must be an admin or have privacy mode disabled)',
  '/help - show this list',
  '/id - show the chat, topic and channel identifiers',
  '/agent - show the current routing setup',
  '/stop - cancel the run the agent is working on in this thread',
  '/stats - token usage and cost for this thread',
  '/skills - skills available to the thread agent',
  '/compact - compact the thread history',
  '',
  'After an admin binds the group in Harnesys, messages that match the routing policy',
  'are delivered to the bound thread agent and its replies come back here.',
].join('\n');

export function botCommands(): Array<{ command: string; description: string }> {
  return REGISTERED_COMMANDS.map((entry) => ({ ...entry }));
}

export function commandsScope(): Record<string, string> {
  return { ...SET_COMMANDS_SCOPE };
}

function commandName(text: string): string {
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

export function isStartCommand(text: string): boolean {
  const name = commandName(text);
  return name === 'start' || name === 'join';
}

const ACTIVE_RUN_STATUSES: readonly string[] = ['running', 'queued', 'waiting', 'needs_input'];

export interface RunLike {
  runId: string;
  status: string;
  startedAt: string | null;
}

interface UsageByModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byModel: UsageByModel[];
}

interface SkillLike {
  name: string;
  description: string | null;
  source: string;
}

type CompactResult =
  | { compacted: true; tokensBefore: number; tokensAfter: number }
  | { compacted: false; reason?: string };

export function pickStoppableRun(runs: RunLike[]): RunLike | null {
  const active = runs.filter((run) => ACTIVE_RUN_STATUSES.includes(run.status));
  let latest: RunLike | null = null;
  for (const run of active) {
    if (latest === null || (run.startedAt ?? '') > (latest.startedAt ?? '')) {
      latest = run;
    }
  }
  return latest;
}

export interface BindingLike {
  channel: string;
  threadId: string;
}

export function threadForChannel(
  bindings: BindingLike[],
  channel: string,
  chatId: string,
): string | null {
  const exact = bindings.find((binding) => binding.channel === channel);
  if (exact !== undefined) {
    return exact.threadId;
  }
  const base = bindings.find((binding) => binding.channel === chatId);
  return base === undefined ? null : base.threadId;
}

export function formatUsage(summary: UsageSummary): string {
  if (summary.byModel.length === 0 && summary.inputTokens === 0 && summary.outputTokens === 0) {
    return 'No usage recorded for this thread yet.';
  }
  const lines = [
    `Input tokens: ${summary.inputTokens.toLocaleString('en-US')}`,
    `Output tokens: ${summary.outputTokens.toLocaleString('en-US')}`,
    `Cost: $${summary.costUsd.toFixed(4)}`,
  ];
  if (summary.byModel.length > 0) {
    lines.push('', 'By model:');
    for (const entry of summary.byModel) {
      lines.push(
        `- ${entry.model}: ${entry.inputTokens.toLocaleString('en-US')} in / ${entry.outputTokens.toLocaleString('en-US')} out ($${entry.costUsd.toFixed(4)})`,
      );
    }
  }
  return lines.join('\n');
}

export function formatSkills(skills: SkillLike[]): string {
  if (skills.length === 0) {
    return 'No skills are available to this thread.';
  }
  const lines = skills.map((skill) => {
    const description = skill.description === null ? '' : `: ${skill.description}`;
    return `- ${skill.name} (${skill.source})${description}`;
  });
  return ['Skills available to this thread:', ...lines].join('\n');
}

export function formatCompact(result: CompactResult): string {
  if (result.compacted) {
    return `Compacted: ${result.tokensBefore.toLocaleString('en-US')} → ${result.tokensAfter.toLocaleString('en-US')} tokens.`;
  }
  return result.reason === undefined
    ? 'Nothing to compact.'
    : `Nothing to compact: ${result.reason}.`;
}

async function reply(ctx: AddonContext, message: CommandMessage, text: string): Promise<unknown> {
  return call(ctx, 'sendMessage', {
    chat_id: message.chatId,
    text,
    ...(message.topicId !== null ? { message_thread_id: Number(message.topicId) } : {}),
    ...(message.messageId !== null ? { reply_to_message_id: message.messageId } : {}),
  });
}

async function adminVerified(ctx: AddonContext, chatId: string): Promise<boolean> {
  const me = await call<{ id: number; can_read_all_group_messages?: boolean }>(ctx, 'getMe', {});
  const member = await call<{ status?: string }>(ctx, 'getChatMember', {
    chat_id: chatId,
    user_id: me.id,
  });
  if (member.status === 'administrator' || member.status === 'creator') {
    return true;
  }
  return me.can_read_all_group_messages === true;
}

export async function registerChat(ctx: AddonContext, message: CommandMessage): Promise<void> {
  const allowed = await adminVerified(ctx, message.chatId);
  if (!allowed) {
    await reply(
      ctx,
      message,
      'This group is not registered. Make the bot a group admin, or disable privacy mode for it in @BotFather (/setprivacy), then send /start again.',
    );
    return;
  }
  await ctx.db.run(
    'insert into chats (chat_id, kind, title, status, updated_at) values (?, ?, ?, ?, ?) on conflict(chat_id) do update set kind = excluded.kind, title = excluded.title, updated_at = excluded.updated_at',
    [message.chatId, 'group', message.chatId, 'discovered', new Date().toISOString()],
  );
  await ctx.log.info('group registered', { chatId: message.chatId });
  await reply(
    ctx,
    message,
    'This group is registered. An admin can bind it to a thread in Harnesys: Settings → Add-ons → Telegram groups.',
  );
}

const UNBOUND_REPLY =
  'This group is not bound to a thread yet. An admin binds it in Harnesys: Settings → Add-ons → Telegram groups.';

async function withBoundThread(
  ctx: AddonContext,
  message: CommandMessage,
  command: string,
  action: (threadId: string) => Promise<string>,
): Promise<void> {
  try {
    const bindings = await ctx.bindings.channels('telegram');
    const threadId = threadForChannel(bindings, message.channel, message.chatId);
    if (threadId === null) {
      await reply(ctx, message, UNBOUND_REPLY);
      return;
    }
    await reply(ctx, message, await action(threadId));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await ctx.log.warn('command failed', { command, chatId: message.chatId, detail });
    await reply(ctx, message, `The command failed: ${detail}`);
  }
}

export async function stopCommand(ctx: AddonContext, message: CommandMessage): Promise<void> {
  await withBoundThread(ctx, message, 'stop', async (threadId) => {
    const runs = await ctx.runs.list({ threadId });
    const run = pickStoppableRun(runs);
    if (run === null) {
      return 'No active run in this thread.';
    }
    await ctx.runs.cancel({ threadId, runId: run.runId });
    await ctx.log.info('run cancelled by /stop', { threadId, runId: run.runId });
    return `Cancelled run ${run.runId} (status: ${run.status}).`;
  });
}

export async function statsCommand(ctx: AddonContext, message: CommandMessage): Promise<void> {
  await withBoundThread(ctx, message, 'stats', async (threadId) =>
    formatUsage(await ctx.usage.summary({ threadId })),
  );
}

export async function skillsCommand(ctx: AddonContext, message: CommandMessage): Promise<void> {
  await withBoundThread(ctx, message, 'skills', async (threadId) =>
    formatSkills(await ctx.skills.list({ threadId })),
  );
}

export async function compactCommand(ctx: AddonContext, message: CommandMessage): Promise<void> {
  await withBoundThread(ctx, message, 'compact', async (threadId) =>
    formatCompact(await ctx.threads.compact({ threadId })),
  );
}

export async function handleCommand(
  ctx: AddonContext,
  message: CommandMessage,
  policy: RoutingPolicy,
): Promise<boolean> {
  const name = commandName(message.text);
  if (name === 'start' || name === 'join') {
    await registerChat(ctx, message);
    return true;
  }
  if (name === 'help') {
    await reply(ctx, message, HELP);
    return true;
  }
  if (name === 'id') {
    const parts = [`chat: ${message.chatId}`, `channel: ${message.channel}`];
    if (message.topicId !== null) {
      parts.push(`topic: ${message.topicId}`);
    }
    await reply(ctx, message, parts.join('\n'));
    return true;
  }
  if (name === 'agent') {
    const row = await ctx.db.get('select status from chats where chat_id = ?', [message.chatId]);
    const status = row === null ? 'not registered' : String(row.status);
    await reply(
      ctx,
      message,
      [
        `Routing policy: ${policy}`,
        `Group status: ${status}`,
        'Messages that match the policy are delivered to the bound thread agent.',
      ].join('\n'),
    );
    return true;
  }
  if (name === 'stop') {
    await stopCommand(ctx, message);
    return true;
  }
  if (name === 'stats') {
    await statsCommand(ctx, message);
    return true;
  }
  if (name === 'skills') {
    await skillsCommand(ctx, message);
    return true;
  }
  if (name === 'compact') {
    await compactCommand(ctx, message);
    return true;
  }
  return false;
}
