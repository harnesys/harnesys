import type { AddonContext, DbRow } from '@harnesys/sdk';
import {
  DEFAULT_INBOX_MAX_BACKLOG,
  DEFAULT_INBOX_MAX_BATCH,
  DEFAULT_INBOX_MAX_CHARS,
  DEFAULT_INBOX_TTL_SEC,
  DEFAULT_REPLY_MODE,
  DEFAULT_REPLY_WINDOW_SEC,
  type InboxEntry,
  type InboxSettings,
  type ReplyMode,
  trimBacklog,
} from './queue.ts';
import type { TelegramMessage } from './telegram.ts';

export interface ChannelInboxState {
  replyMessageId: number | null;
  replyAt: number | null;
  omitted: number;
}

const EMPTY_STATE: ChannelInboxState = { replyMessageId: null, replyAt: null, omitted: 0 };

function numberSetting(value: unknown, fallback: number, min: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min
    ? Math.floor(value)
    : fallback;
}

function replyModeOf(value: unknown): ReplyMode {
  return value === 'always' || value === 'never' ? value : DEFAULT_REPLY_MODE;
}

export async function inboxSettings(ctx: AddonContext): Promise<InboxSettings> {
  const config = await ctx.config.get([
    'inbox_max_batch',
    'inbox_max_chars',
    'inbox_max_backlog',
    'inbox_ttl_sec',
    'reply_mode',
    'reply_window_sec',
    'attribution',
  ]);
  return {
    maxBatch: numberSetting(config.inbox_max_batch, DEFAULT_INBOX_MAX_BATCH, 1),
    maxChars: numberSetting(config.inbox_max_chars, DEFAULT_INBOX_MAX_CHARS, 1),
    maxBacklog: numberSetting(config.inbox_max_backlog, DEFAULT_INBOX_MAX_BACKLOG, 1),
    ttlSec: numberSetting(config.inbox_ttl_sec, DEFAULT_INBOX_TTL_SEC, 0),
    replyMode: replyModeOf(config.reply_mode),
    replyWindowSec: numberSetting(config.reply_window_sec, DEFAULT_REPLY_WINDOW_SEC, 0),
    attribution: config.attribution !== false,
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function messageOf(row: DbRow): TelegramMessage | null {
  if (typeof row.payload !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(row.payload);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as { message_id?: unknown; chat?: unknown };
    if (typeof candidate.message_id !== 'number') {
      return null;
    }
    if (typeof candidate.chat !== 'object' || candidate.chat === null) {
      return null;
    }
    const chat = candidate.chat as { id?: unknown };
    return typeof chat.id === 'number' ? (parsed as TelegramMessage) : null;
  } catch {
    return null;
  }
}

export async function deleteQueueEntries(ctx: AddonContext, ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const placeholders = ids.map(() => '?').join(', ');
  await ctx.db.run(`delete from inbox_queue where id in (${placeholders})`, ids);
}

export async function queuedEntries(
  ctx: AddonContext,
  channel: string,
  limit: number,
): Promise<InboxEntry[]> {
  const rows = await ctx.db.all(
    'select id, message_id, payload, at from inbox_queue where channel = ? order by id asc limit ?',
    [channel, limit],
  );
  const entries: InboxEntry[] = [];
  const corrupt: number[] = [];
  for (const row of rows) {
    const id = asNumber(row.id);
    const messageId = asNumber(row.message_id);
    const at = asNumber(row.at);
    const message = messageOf(row);
    if (id === null || messageId === null || at === null || message === null) {
      if (id !== null) {
        corrupt.push(id);
      }
      continue;
    }
    entries.push({ id, messageId, at, message });
  }
  await deleteQueueEntries(ctx, corrupt);
  return entries;
}

async function trimQueue(ctx: AddonContext, channel: string, maxBacklog: number): Promise<number> {
  const rows = await ctx.db.all('select id from inbox_queue where channel = ? order by id asc', [
    channel,
  ]);
  const ids = rows.map((row) => asNumber(row.id)).filter((id): id is number => id !== null);
  const { dropped } = trimBacklog(ids, maxBacklog);
  if (dropped === 0) {
    return 0;
  }
  await deleteQueueEntries(ctx, ids.slice(0, dropped));
  await bumpOmitted(ctx, channel, dropped);
  return dropped;
}

export async function enqueueMessages(
  ctx: AddonContext,
  channel: string,
  messages: TelegramMessage[],
  maxBacklog: number,
  at: number,
): Promise<number> {
  let inserted = 0;
  for (const message of messages) {
    const result = await ctx.db.run(
      'insert or ignore into inbox_queue (channel, message_id, payload, at) values (?, ?, ?, ?)',
      [channel, message.message_id, JSON.stringify(message), at],
    );
    inserted += result.changes;
  }
  await trimQueue(ctx, channel, maxBacklog);
  return inserted;
}

export async function channelState(ctx: AddonContext, channel: string): Promise<ChannelInboxState> {
  const row = await ctx.db.get(
    'select reply_message_id, reply_at, omitted from inbox_state where channel = ?',
    [channel],
  );
  if (row === null) {
    return EMPTY_STATE;
  }
  return {
    replyMessageId: asNumber(row.reply_message_id),
    replyAt: asNumber(row.reply_at),
    omitted: asNumber(row.omitted) ?? 0,
  };
}

export async function setReplyAnchor(
  ctx: AddonContext,
  channel: string,
  messageId: number,
  at: number,
): Promise<void> {
  await ctx.db.run(
    'insert into inbox_state (channel, reply_message_id, reply_at, omitted) values (?, ?, ?, 0) on conflict(channel) do update set reply_message_id = excluded.reply_message_id, reply_at = excluded.reply_at',
    [channel, messageId, at],
  );
}

export async function clearReplyAnchor(ctx: AddonContext, channel: string): Promise<void> {
  await ctx.db.run(
    'update inbox_state set reply_message_id = null, reply_at = null where channel = ?',
    [channel],
  );
}

export async function bumpOmitted(
  ctx: AddonContext,
  channel: string,
  count: number,
): Promise<void> {
  if (count <= 0) {
    return;
  }
  await ctx.db.run(
    'insert into inbox_state (channel, reply_message_id, reply_at, omitted) values (?, null, null, ?) on conflict(channel) do update set omitted = inbox_state.omitted + excluded.omitted',
    [channel, count],
  );
}

export async function resetOmitted(ctx: AddonContext, channel: string): Promise<void> {
  await ctx.db.run('update inbox_state set omitted = 0 where channel = ?', [channel]);
}

export async function pendingChannels(ctx: AddonContext): Promise<string[]> {
  const rows = await ctx.db.all('select distinct channel from inbox_queue order by channel');
  return rows
    .map((row) => row.channel)
    .filter((channel): channel is string => typeof channel === 'string' && channel.length > 0);
}

export async function hasPendingInbox(ctx: AddonContext): Promise<boolean> {
  const row = await ctx.db.get('select 1 as pending from inbox_queue limit 1');
  return row !== null;
}

export async function boundThreadOf(ctx: AddonContext, channel: string): Promise<string | null> {
  const row = await ctx.db.get(
    'select thread_id from connections where channel = ? and status = ?',
    [channel, 'connected'],
  );
  return row !== null && typeof row.thread_id === 'string' ? row.thread_id : null;
}
