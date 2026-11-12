import type { AddonContext } from '@harnesys/sdk';
import { call } from './bot-api.ts';
import { commandNameOf, handleCommand, isCommand } from './commands.ts';
import { createPairCode } from './pair-code.ts';
import {
  channelOf,
  fileRefOf,
  firstText,
  inboundAttachments,
  type TelegramMessage,
} from './telegram.ts';

export type { TelegramMessage, TelegramUpdate } from './telegram.ts';
export { groupMessages, mimeOf } from './telegram.ts';

export interface PairingRow {
  chatId: string;
  userId: string;
  status: 'pending' | 'paired';
  codeHash: string | null;
  expiresAt: string | null;
}

export type PairingGate = 'allow' | 'pending' | 'not_paired' | 'other_user';

export function pairingGate(row: PairingRow | null, userId: string | null): PairingGate {
  if (row === null || row.status !== 'paired') {
    return row === null ? 'not_paired' : 'pending';
  }
  if (userId === null || row.userId !== userId) {
    return 'other_user';
  }
  return 'allow';
}

export const NOT_PAIRED = [
  'This chat is not paired with a Harnesys workspace yet.',
  'Send /start to get a pair code, then enter it in the Harnesys add-on settings.',
].join('\n');

const OTHER_ACCOUNT = 'This chat is paired with a different Telegram account.';

const PENDING_PAIRING = [
  'A pair code was already issued for this chat.',
  'Enter it in Harnesys: Settings → Add-ons → Telegram bot → "Pair a chat".',
  'If the code expired, send /start again for a new one.',
].join('\n');

interface GateContext {
  chatId: string;
  userId: string | null;
  single: boolean;
  first: TelegramMessage;
  text: string;
  channel: string;
}

async function loadPairing(ctx: AddonContext, chatId: string): Promise<PairingRow | null> {
  const row = await ctx.db.get(
    'select chat_id as chatId, user_id as userId, status, code_hash as codeHash, expires_at as expiresAt from pairings where chat_id = ?',
    [chatId],
  );
  if (row === null) {
    return null;
  }
  return {
    chatId: String(row.chatId),
    userId: String(row.userId),
    status: row.status === 'paired' ? 'paired' : 'pending',
    codeHash: typeof row.codeHash === 'string' ? row.codeHash : null,
    expiresAt: typeof row.expiresAt === 'string' ? row.expiresAt : null,
  };
}

async function startPairing(ctx: AddonContext, message: TelegramMessage): Promise<void> {
  const chatId = String(message.chat.id);
  const userId = String(message.from?.id ?? '');
  if (userId.length === 0) {
    return;
  }
  const { code, hash, expiresAt } = createPairCode();
  await ctx.db.run(
    'insert into pairings (chat_id, user_id, status, code_hash, expires_at, updated_at) values (?, ?, ?, ?, ?, ?) on conflict(chat_id) do update set user_id = excluded.user_id, status = excluded.status, code_hash = excluded.code_hash, expires_at = excluded.expires_at, updated_at = excluded.updated_at',
    [chatId, userId, 'pending', hash, expiresAt, new Date().toISOString()],
  );
  await ctx.log.info('pair code issued', { chatId });
  await call(ctx, 'sendMessage', {
    chat_id: chatId,
    text: [
      `Pair code: ${code}`,
      '',
      'Enter this code in Harnesys: Settings → Add-ons → Telegram bot → "Pair a chat".',
      'The code expires in 30 minutes.',
    ].join('\n'),
  });
}

async function handleGate(ctx: AddonContext, parts: GateContext): Promise<boolean> {
  const pairing = await loadPairing(ctx, parts.chatId);
  const gate = pairingGate(pairing, parts.userId);
  const isStart = parts.single && isCommand(parts.text) && commandNameOf(parts.text) === 'start';
  if (isStart) {
    if (gate === 'allow') {
      await call(ctx, 'sendMessage', {
        chat_id: parts.chatId,
        text: 'This chat is already paired. Send /help for the command list.',
      });
    } else {
      await startPairing(ctx, parts.first);
    }
    return true;
  }
  if (gate === 'other_user') {
    await call(ctx, 'sendMessage', { chat_id: parts.chatId, text: OTHER_ACCOUNT });
    return true;
  }
  if (gate === 'pending') {
    await call(ctx, 'sendMessage', { chat_id: parts.chatId, text: PENDING_PAIRING });
    return true;
  }
  if (gate !== 'allow') {
    await call(ctx, 'sendMessage', { chat_id: parts.chatId, text: NOT_PAIRED });
    return true;
  }
  return false;
}

async function handleDmCommands(
  ctx: AddonContext,
  parts: GateContext,
  commandsEnabled: boolean,
): Promise<boolean> {
  if (!commandsEnabled || !isCommand(parts.text)) {
    return false;
  }
  return handleCommand(ctx, {
    chatId: parts.chatId,
    topicId:
      parts.first.message_thread_id === undefined ? null : String(parts.first.message_thread_id),
    text: parts.text,
    channel: parts.channel,
  });
}

export async function handleGroup(ctx: AddonContext, messages: TelegramMessage[]): Promise<void> {
  const first = messages[0];
  if (first === undefined || messages.every((entry) => entry.from?.is_bot === true)) {
    return;
  }
  const text = firstText(messages);
  const chatId = String(first.chat.id);
  if (first.chat.type !== 'private') {
    await ctx.log.warn('telegram-bot ignores non-private chats', { chatId, kind: first.chat.type });
    return;
  }
  const parts: GateContext = {
    chatId,
    userId: first.from === undefined ? null : String(first.from.id),
    single: messages.length === 1,
    first,
    text,
    channel: channelOf(first),
  };
  if (await handleGate(ctx, parts)) {
    return;
  }
  const hasFile = messages.some((entry) => fileRefOf(entry) !== null);
  if (text.length === 0 && !hasFile) {
    return;
  }
  const commandsEnabled = (await ctx.config.get(['commands'])).commands !== false;
  if (parts.single && (await handleDmCommands(ctx, parts, commandsEnabled))) {
    return;
  }
  await bridgeMessages(ctx, messages);
}

async function bridgeMessages(ctx: AddonContext, messages: TelegramMessage[]): Promise<void> {
  const first = messages[0];
  if (first === undefined) {
    return;
  }
  const text = firstText(messages);
  const hasFile = messages.some((entry) => fileRefOf(entry) !== null);
  if (text.length === 0 && !hasFile) {
    return;
  }
  const attachments = await inboundAttachments(ctx, messages);
  await ctx.bridge.inbound({
    channel: channelOf(first),
    from: first.from === undefined ? undefined : `telegram:${first.from.id}`,
    text: text.length === 0 ? '[attachment]' : text,
    payload: {
      provider: 'telegram',
      chatId: first.chat.id,
      messageId: first.message_id,
      topicId: first.message_thread_id ?? null,
    },
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}
