import type { AddonContext } from '@harnesys/sdk';
import {
  type CommandMessage,
  handleCommand,
  isCommand,
  isStartCommand,
  registerChat,
} from './commands.ts';
import { attributedText, authorLabel } from './routing.ts';
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
 * of the group. No connection — nothing mirrors.
 */
async function resolveChannel(
  ctx: AddonContext,
  chatId: string,
  topicId: string | null,
): Promise<string | null> {
  if (topicId !== null) {
    const exact = await ctx.db.get('select channel from connections where channel = ?', [
      channelOfParts(chatId, topicId),
    ]);
    if (exact !== null) {
      return String(exact.channel);
    }
  }
  const group = await ctx.db.get('select channel from connections where channel = ?', [chatId]);
  return group === null ? null : String(group.channel);
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
  await bridgeMessages(ctx, messages, channel);
}

async function bridgeMessages(
  ctx: AddonContext,
  messages: TelegramMessage[],
  channel: string,
): Promise<void> {
  const first = messages[0];
  if (first === undefined) {
    return;
  }
  const text = firstText(messages);
  const hasFile = messages.some((entry) => fileRefOf(entry) !== null);
  if (text.length === 0 && !hasFile) {
    return;
  }
  const attribution = (await ctx.config.get(['attribution'])).attribution !== false;
  const chatTitle = first.chat.title ?? first.chat.username ?? String(first.chat.id);
  const plain = text.length === 0 ? '[attachment]' : text;
  const bridgeText = attribution
    ? attributedText(authorLabel(first.from), chatTitle, plain)
    : plain;
  const attachments = await inboundAttachments(ctx, messages);
  await ctx.bridge.inbound({
    channel,
    from: first.from === undefined ? undefined : `telegram:${first.from.id}`,
    text: bridgeText,
    payload: {
      provider: 'telegram',
      chatId: first.chat.id,
      messageId: first.message_id,
      topicId: first.message_thread_id ?? null,
      chatTitle,
    },
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}
