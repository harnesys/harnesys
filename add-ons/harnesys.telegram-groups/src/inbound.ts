import type { AddonContext } from '@harnesys/sdk';
import { call } from './bot-api.ts';
import {
  type CommandMessage,
  handleCommand,
  isCommand,
  isStartCommand,
  registerChat,
} from './commands.ts';
import {
  attributedText,
  authorLabel,
  isMentioned,
  type RoutingPolicy,
  routeDecision,
} from './routing.ts';
import {
  channelOf,
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

const UNBOUND_HINT =
  'This group is not connected yet. Send /start to register it, then an admin binds it to a thread in Harnesys.';

async function routingPolicyOf(ctx: AddonContext): Promise<RoutingPolicy> {
  const config = await ctx.config.get(['routing']);
  const value = config.routing;
  return value === 'always' || value === 'reply' || value === 'commands' ? value : 'mention';
}

async function touchChat(ctx: AddonContext, message: TelegramMessage): Promise<void> {
  await ctx.db.run(
    'insert into chats (chat_id, kind, title, status, updated_at) values (?, ?, ?, ?, ?) on conflict(chat_id) do update set kind = excluded.kind, title = excluded.title, updated_at = excluded.updated_at',
    [
      String(message.chat.id),
      message.chat.type,
      message.chat.title ?? message.chat.username ?? String(message.chat.id),
      'discovered',
      new Date().toISOString(),
    ],
  );
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
  const policy = await routingPolicyOf(ctx);
  const message = await commandMessageOf(parts);
  if (isStartCommand(parts.text)) {
    await registerChat(ctx, message);
    return true;
  }
  return handleCommand(ctx, message, policy);
}

export async function handleGroup(
  ctx: AddonContext,
  messages: TelegramMessage[],
  identity: BotIdentityState,
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
  const policy = await routingPolicyOf(ctx);
  if (!shouldBridge(first, text, identity, policy)) {
    return;
  }
  if ((await chatStatus(ctx, chatId)) !== 'bound') {
    await call(ctx, 'sendMessage', {
      chat_id: chatId,
      text: UNBOUND_HINT,
      ...(first.message_thread_id !== undefined
        ? { message_thread_id: first.message_thread_id }
        : {}),
      reply_to_message_id: first.message_id,
    });
    return;
  }
  await bridgeMessages(ctx, messages);
}

function shouldBridge(
  first: TelegramMessage,
  text: string,
  identity: BotIdentityState,
  policy: RoutingPolicy,
): boolean {
  const replyToBot = first.reply_to_message?.from?.id === identity.botId;
  const mentioned = identity.botUsername !== null && isMentioned(text, identity.botUsername);
  const decision = routeDecision(policy, {
    text,
    isCommand: false,
    mentioned,
    replyToBot,
  });
  return decision === 'bridge';
}

async function bridgeMessages(ctx: AddonContext, messages: TelegramMessage[]): Promise<void> {
  const first = messages[0];
  if (first === undefined) {
    return;
  }
  await touchChat(ctx, first);
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
    channel: channelOf(first),
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
