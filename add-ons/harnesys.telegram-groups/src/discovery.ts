import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import type { TelegramChat, TelegramMessage } from './telegram.ts';

/**
 * Discovery store for chats and forum topics the poller has actually seen.
 * The Bot API cannot enumerate the bot's chats, so this table is the
 * discovery surface the settings page renders.
 */

export interface ChatRow {
  chatId: string;
  kind: string;
  title: string;
  titleOverride: string | null;
  status: string;
  updatedAt: string;
}

export interface TopicRow {
  chatId: string;
  topicId: string;
  title: string;
  updatedAt: string;
}

export type ConnectTarget =
  | { kind: 'group' }
  | { kind: 'existing'; topicId: string }
  | { kind: 'create'; name: string };

function now(): string {
  return new Date().toISOString();
}

function chatTitleOf(chat: TelegramChat): string {
  return chat.title ?? chat.username ?? String(chat.id);
}

function invalid(detail: string): AddonError {
  return new AddonError('invalid_params', { detail });
}

export async function touchChat(ctx: AddonContext, chat: TelegramChat): Promise<void> {
  await ctx.db.run(
    'insert into chats (chat_id, kind, title, status, updated_at) values (?, ?, ?, ?, ?) on conflict(chat_id) do update set kind = excluded.kind, title = excluded.title, updated_at = excluded.updated_at',
    [String(chat.id), chat.type, chatTitleOf(chat), 'discovered', now()],
  );
}

export async function touchTopic(
  ctx: AddonContext,
  chatId: string,
  topicId: string,
  title: string | null,
): Promise<void> {
  if (title !== null) {
    await ctx.db.run(
      'insert into topics (chat_id, topic_id, title, updated_at) values (?, ?, ?, ?) on conflict(chat_id, topic_id) do update set title = excluded.title, updated_at = excluded.updated_at',
      [chatId, topicId, title, now()],
    );
    return;
  }
  // No name known yet: register the topic, keep an already learned title.
  await ctx.db.run(
    'insert into topics (chat_id, topic_id, title, updated_at) values (?, ?, ?, ?) on conflict(chat_id, topic_id) do update set updated_at = excluded.updated_at',
    [chatId, topicId, `Topic ${topicId}`, now()],
  );
}

/**
 * Discovery for one inbound message: registers the chat and its forum topic.
 * Telegram never exposes topic names on demand (no Bot API getter), so names
 * heal from service messages: every plain message in a topic arrives as a
 * reply to the topic-creation service message carrying the original name.
 */
export async function discoverMessage(ctx: AddonContext, message: TelegramMessage): Promise<void> {
  if (message.chat.type === 'private') {
    return;
  }
  await touchChat(ctx, message.chat);
  if (message.message_thread_id !== undefined) {
    const knownName =
      message.forum_topic_created?.name ??
      message.forum_topic_edited?.name ??
      message.reply_to_message?.forum_topic_created?.name ??
      null;
    await touchTopic(ctx, String(message.chat.id), String(message.message_thread_id), knownName);
  }
}

const CHAT_COLUMNS = 'chat_id, kind, title, title_override, status, updated_at';

function chatRowOf(row: Record<string, unknown>): ChatRow {
  return {
    chatId: String(row.chat_id),
    kind: String(row.kind),
    title: String(row.title),
    titleOverride: typeof row.title_override === 'string' ? row.title_override : null,
    status: String(row.status),
    updatedAt: String(row.updated_at),
  };
}

export async function listChats(ctx: AddonContext): Promise<ChatRow[]> {
  const rows = await ctx.db.all(
    `select ${CHAT_COLUMNS} from chats order by updated_at desc limit 200`,
  );
  return rows.map(chatRowOf);
}

export async function requireChat(ctx: AddonContext, chatId: string): Promise<ChatRow> {
  const row = await ctx.db.get(`select ${CHAT_COLUMNS} from chats where chat_id = ?`, [chatId]);
  if (row === null) {
    throw invalid(`chat ${chatId} is not registered. Send /start or /join in the group first.`);
  }
  return chatRowOf(row);
}

const TOPIC_COLUMNS = 'chat_id, topic_id, title, updated_at';

function topicRowOf(row: Record<string, unknown>): TopicRow {
  return {
    chatId: String(row.chat_id),
    topicId: String(row.topic_id),
    title: String(row.title),
    updatedAt: String(row.updated_at),
  };
}

export async function listTopics(ctx: AddonContext, chatId: string): Promise<TopicRow[]> {
  const rows = await ctx.db.all(
    `select ${TOPIC_COLUMNS} from topics where chat_id = ? order by title`,
    [chatId],
  );
  return rows.map(topicRowOf);
}

export async function listAllTopics(ctx: AddonContext): Promise<TopicRow[]> {
  const rows = await ctx.db.all(
    `select ${TOPIC_COLUMNS} from topics order by chat_id, title limit 500`,
  );
  return rows.map(topicRowOf);
}

export async function findTopic(
  ctx: AddonContext,
  chatId: string,
  topicId: string,
): Promise<TopicRow | null> {
  const row = await ctx.db.get(
    `select ${TOPIC_COLUMNS} from topics where chat_id = ? and topic_id = ?`,
    [chatId, topicId],
  );
  return row === null ? null : topicRowOf(row);
}

/** Pure helpers used by the connect route and covered by specs. */

export function resolveConnectTarget(topic: string | undefined): ConnectTarget {
  const value = (topic ?? '').trim();
  if (value.length === 0) {
    return { kind: 'group' };
  }
  if (/^\d+$/.test(value)) {
    return { kind: 'existing', topicId: value };
  }
  return { kind: 'create', name: value };
}

export function connectTitle(chatTitle: string, topicTitle: string | null): string {
  return topicTitle === null ? chatTitle : `${chatTitle} · ${topicTitle}`;
}

export function displayTitleOf(chat: ChatRow): string {
  return chat.titleOverride ?? chat.title;
}
