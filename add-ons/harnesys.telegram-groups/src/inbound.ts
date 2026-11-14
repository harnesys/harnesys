import type { AddonContext } from '@harnesys/sdk';
import {
  type CommandMessage,
  handleCommand,
  isCommand,
  isStartCommand,
  registerChat,
} from './commands.ts';
import { connectionAlive } from './lifecycle.ts';
import {
  filterFresh,
  hasActiveRun,
  type InboxSettings,
  renderBatch,
  shouldDropAfter,
} from './queue.ts';
import {
  boundThreadOf,
  bumpOmitted,
  channelState,
  deleteQueueEntries,
  enqueueMessages,
  inboxSettings,
  pendingChannels,
  queuedEntries,
  resetOmitted,
  setReplyAnchor,
} from './queue-store.ts';
import {
  channelOf,
  channelOfParts,
  fileRefOf,
  firstText,
  inboundAttachments,
  type TelegramMessage,
} from './telegram.ts';

export type { TelegramMessage, TelegramUpdate } from './telegram.ts';
export { groupMessages, mimeOf } from './telegram.ts';

export interface BotIdentityState {
  botId: number;
  botUsername: string | null;
}

async function chatStatus(ctx: AddonContext, chatId: string): Promise<string | null> {
  const row = await ctx.db.get('select status from chats where chat_id = ?', [chatId]);
  return row === null ? null : String(row.status);
}

interface CommandParts {
  chatId: string;
  channel: string;
  first: TelegramMessage;
  text: string;
}

async function commandMessageOf(parts: CommandParts): Promise<CommandMessage> {
  return {
    chatId: parts.chatId,
    topicId:
      parts.first.message_thread_id === undefined ? null : String(parts.first.message_thread_id),
    messageId: parts.first.message_id,
    text: parts.text,
    channel: parts.channel,
  };
}

async function handleCommands(
  ctx: AddonContext,
  parts: CommandParts,
  single: boolean,
  commandsEnabled: boolean,
): Promise<boolean> {
  if (!single || !commandsEnabled || !isCommand(parts.text)) {
    return false;
  }
  const message = await commandMessageOf(parts);
  if (isStartCommand(parts.text)) {
    await registerChat(ctx, message);
    return true;
  }
  return handleCommand(ctx, message);
}

/**
 * Resolves the channel a group message bridges through: an exact topic
 * connection wins, otherwise the whole-group connection catches every topic
 * of the group. Only live connections count; no connection — nothing mirrors.
 */
async function resolveChannel(
  ctx: AddonContext,
  chatId: string,
  topicId: string | null,
): Promise<string | null> {
  if (topicId !== null) {
    const exact = await ctx.db.get(
      'select channel from connections where channel = ? and status = ?',
      [channelOfParts(chatId, topicId), 'connected'],
    );
    if (exact !== null && typeof exact.channel === 'string') {
      return exact.channel;
    }
  }
  const group = await ctx.db.get(
    'select channel from connections where channel = ? and status = ?',
    [chatId, 'connected'],
  );
  return group !== null && typeof group.channel === 'string' ? group.channel : null;
}

export async function handleGroup(
  ctx: AddonContext,
  messages: TelegramMessage[],
  _identity: BotIdentityState,
): Promise<void> {
  const first = messages[0];
  if (first === undefined || messages.every((entry) => entry.from?.is_bot === true)) {
    return;
  }
  const text = firstText(messages);
  const chatId = String(first.chat.id);
  if (first.chat.type === 'private') {
    await ctx.log.warn('telegram-groups ignores private chats', { chatId });
    return;
  }
  const parts: CommandParts = { chatId, channel: channelOf(first), first, text };
  const commandsEnabled = (await ctx.config.get(['commands'])).commands !== false;
  if (await handleCommands(ctx, parts, messages.length === 1, commandsEnabled)) {
    return;
  }
  if ((await chatStatus(ctx, chatId)) !== 'bound') {
    return;
  }
  const topicId = first.message_thread_id === undefined ? null : String(first.message_thread_id);
  const channel = await resolveChannel(ctx, chatId, topicId);
  if (channel === null) {
    return;
  }
  const row = await ctx.db.get('select thread_id from connections where channel = ?', [channel]);
  if (row === null || typeof row.thread_id !== 'string') {
    return;
  }
  if (!(await connectionAlive(ctx, channel, row.thread_id))) {
    return;
  }
  const settings = await inboxSettings(ctx);
  const deliverable = messages.filter(
    (entry) => (entry.text ?? entry.caption ?? '').length > 0 || fileRefOf(entry) !== null,
  );
  if (deliverable.length === 0) {
    return;
  }
  await enqueueMessages(ctx, channel, deliverable, settings.maxBacklog, Date.now());
  await flushChannel(ctx, channel, settings);
}

export async function flushChannels(ctx: AddonContext): Promise<void> {
  for (const channel of await pendingChannels(ctx)) {
    try {
      await flushChannel(ctx, channel);
    } catch (error) {
      await ctx.log.warn('inbox flush failed', {
        channel,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function flushChannel(
  ctx: AddonContext,
  channel: string,
  settings?: InboxSettings,
): Promise<boolean> {
  const threadId = await boundThreadOf(ctx, channel);
  if (threadId === null) {
    return false;
  }
  const config = settings ?? (await inboxSettings(ctx));
  const runs = await ctx.runs.list({ threadId });
  if (hasActiveRun(runs)) {
    return false;
  }
  const batch = await queuedEntries(ctx, channel, config.maxBatch);
  if (batch.length === 0) {
    return false;
  }
  const now = Date.now();
  const { fresh, expired } = filterFresh(batch, now, config.ttlSec);
  if (expired.length > 0) {
    await deleteQueueEntries(
      ctx,
      expired.map((entry) => entry.id),
    );
    await bumpOmitted(ctx, channel, expired.length);
  }
  const first = fresh[0];
  const last = fresh.at(-1);
  if (first === undefined || last === undefined) {
    return false;
  }
  const state = await channelState(ctx, channel);
  const rendered = renderBatch(
    fresh,
    config.attribution,
    config.maxChars,
    state.omitted + expired.length,
  );
  const attachments = await inboundAttachments(
    ctx,
    fresh.map((entry) => entry.message),
  );
  const chatTitle = first.message.chat.title ?? first.message.chat.username ?? channel;
  const outcome = await ctx.bridge.inbound({
    channel,
    from: first.message.from === undefined ? undefined : `telegram:${first.message.from.id}`,
    text: rendered.text,
    payload: {
      provider: 'telegram',
      chatId: first.message.chat.id,
      messageId: first.messageId,
      topicId: first.message.message_thread_id ?? null,
      chatTitle,
    },
    ...(attachments.length > 0 ? { attachments } : {}),
  });
  if (!shouldDropAfter(outcome)) {
    if (outcome === 'failed') {
      await ctx.log.warn('bridge inbound failed, keeping queued messages', { channel });
    }
    return false;
  }
  await deleteQueueEntries(
    ctx,
    fresh.map((entry) => entry.id),
  );
  await setReplyAnchor(ctx, channel, last.messageId, now);
  await resetOmitted(ctx, channel);
  return true;
}
