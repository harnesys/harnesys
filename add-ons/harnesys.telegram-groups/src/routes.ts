import type { AddonContext, DbRow, RouteHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { z } from 'zod';
import { call } from './bot-api.ts';
import {
  connectTitle,
  displayTitleOf,
  listAllTopics,
  listChats,
  listTopics,
  requireChat,
  requireTopic,
  resolveConnectTarget,
  type TopicRow,
  touchTopic,
} from './discovery.ts';
import { CONNECTED } from './lifecycle.ts';
import { channelOfParts } from './telegram.ts';

export interface RouteRequestLike {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: unknown;
}

export interface RouteCall {
  routeId: string;
  request: RouteRequestLike;
}

function invalid(detail: string): AddonError {
  return new AddonError('invalid_params', { detail });
}

function asCall(params: unknown): RouteCall {
  return params as RouteCall;
}

export const chats: RouteHandler = async (_params, ctx: AddonContext) => {
  const rows = await listChats(ctx);
  return {
    status: 200,
    body: {
      rows: rows.map((row) => ({
        id: row.chatId,
        kind: row.kind,
        title: displayTitleOf(row),
        status: row.status,
        updatedAt: row.updatedAt,
      })),
    },
  };
};

export const topics: RouteHandler = async (params, ctx: AddonContext) => {
  const chatId = asCall(params).request.query.chat ?? '';
  const rows: TopicRow[] =
    chatId.length > 0 ? await listTopics(ctx, chatId) : await listAllTopics(ctx);
  return {
    status: 200,
    body: {
      rows: rows.map((row) => ({
        chatId: row.chatId,
        topicId: row.topicId,
        title: row.title,
      })),
    },
  };
};

const ConnectBodySchema = z.object({
  chat: z.string().min(1),
  topic: z.string().optional(),
  agentId: z.string().uuid(),
  mode: z.enum(['auto', 'mention']).optional(),
  title: z.string().optional(),
});

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Binds a discovered group or forum topic to a fresh thread. Every connection
 * mirrors unconditionally; the responder mode lives on the thread policy (one
 * source of truth) and only decides who answers: 'auto' lets the pinned agent
 * answer every message, 'mention' waits for @mentions and replies.
 */
export const connect: RouteHandler = async (params, ctx: AddonContext) => {
  const parsed = ConnectBodySchema.safeParse(asCall(params).request.body);
  if (!parsed.success) {
    throw invalid('body must be { chat, topic?, agentId, mode?, title? }');
  }
  const body = parsed.data;
  const mode = body.mode ?? 'auto';
  const target = resolveConnectTarget(body.topic);
  const chat = await requireChat(ctx, body.chat);
  let topicId: string | null = null;
  let topicTitle: string | null = null;
  if (target.kind === 'create') {
    const created = await call<{ message_thread_id: number }>(ctx, 'createForumTopic', {
      chat_id: body.chat,
      name: target.name,
    });
    topicId = String(created.message_thread_id);
    topicTitle = target.name;
    await touchTopic(ctx, chat.chatId, topicId, topicTitle);
  } else if (target.kind === 'existing') {
    const topic = await requireTopic(ctx, chat.chatId, target.topicId);
    topicId = topic.topicId;
    topicTitle = topic.title;
  }
  const channel = channelOfParts(chat.chatId, topicId ?? undefined);
  const threadTitle = (body.title ?? '').trim() || connectTitle(displayTitleOf(chat), topicTitle);
  const thread = await ctx.threads.create({
    agentId: body.agentId,
    title: threadTitle,
    kind: 'group',
    responderMode: mode,
  });
  await ctx.bindings.bind({ provider: 'telegram', channel, threadId: thread.threadId });
  await ctx.db.run(
    'insert into connections (channel, chat_id, topic_id, agent_id, thread_id, thread_title, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(channel) do update set agent_id = excluded.agent_id, thread_id = excluded.thread_id, thread_title = excluded.thread_title, status = excluded.status, updated_at = excluded.updated_at',
    [
      channel,
      chat.chatId,
      topicId,
      body.agentId,
      thread.threadId,
      threadTitle,
      CONNECTED,
      nowIso(),
      nowIso(),
    ],
  );
  await ctx.db.run('update chats set status = ?, updated_at = ? where chat_id = ?', [
    'bound',
    nowIso(),
    chat.chatId,
  ]);
  await ctx.log.info('group connected', {
    chatId: chat.chatId,
    channel,
    threadId: thread.threadId,
    mode,
  });
  const place =
    topicTitle === null ? displayTitleOf(chat) : `${displayTitleOf(chat)} · ${topicTitle}`;
  return {
    status: 200,
    body: {
      toast:
        mode === 'mention'
          ? `Connected ${place}. Messages mirror into the thread; agents answer on @mentions.`
          : `Connected ${place}. Messages mirror into the thread; the agent answers every message.`,
      refresh: true,
    },
  };
};

const RenameBodySchema = z.object({
  chat: z.string().min(1),
  title: z.string().min(1).max(200),
});

export const rename: RouteHandler = async (params, ctx: AddonContext) => {
  const call = asCall(params);
  const parsed = RenameBodySchema.safeParse(call.request.body);
  if (!parsed.success) {
    throw invalid('body must be { chat: string, title: string }');
  }
  const chat = await requireChat(ctx, parsed.data.chat);
  await ctx.db.run('update chats set title_override = ?, updated_at = ? where chat_id = ?', [
    parsed.data.title,
    new Date().toISOString(),
    chat.chatId,
  ]);
  return {
    status: 200,
    body: { toast: `Renamed ${chat.title} to ${parsed.data.title}.`, refresh: true },
  };
};

interface ConnectionRow {
  channel: string;
  chat_id: string;
  topic_id: string | null;
  agent_id: string;
  thread_id: string;
  thread_title: string;
  status: string;
  updated_at: string;
}

function isConnectionRow(row: DbRow): row is DbRow & ConnectionRow {
  return (
    typeof row.channel === 'string' &&
    typeof row.chat_id === 'string' &&
    typeof row.agent_id === 'string' &&
    typeof row.thread_id === 'string' &&
    typeof row.thread_title === 'string' &&
    typeof row.updated_at === 'string' &&
    (row.topic_id === null || typeof row.topic_id === 'string') &&
    (row.status === undefined || typeof row.status === 'string')
  );
}

function statusOf(row: DbRow & Partial<ConnectionRow>): string {
  return row.status ?? CONNECTED;
}

const UnbindBodySchema = z.object({
  channel: z.string().min(1),
});

/**
 * Drops one connection from the Routing table: the row is deleted, the
 * transport binding is removed and mirroring stops immediately. The thread
 * itself stays.
 */
export const unbind: RouteHandler = async (params, ctx: AddonContext) => {
  const call = asCall(params);
  const parsed = UnbindBodySchema.safeParse({
    channel: call.request.query.channel ?? readChannelBody(call.request.body),
  });
  if (!parsed.success) {
    throw invalid('unbind needs a channel query parameter');
  }
  const channel = parsed.data.channel;
  const row = await ctx.db.get('select chat_id from connections where channel = ?', [channel]);
  if (row === null || typeof row.chat_id !== 'string') {
    throw invalid(`no connection for channel ${channel}`);
  }
  await ctx.db.run('delete from connections where channel = ?', [channel]);
  await ctx.bindings.unbind({ provider: 'telegram', channel });
  const remaining = await ctx.db.get(
    'select count(*) as count from connections where chat_id = ? and status = ?',
    [row.chat_id, CONNECTED],
  );
  const liveLeft = remaining !== null && Number(remaining.count) > 0;
  if (!liveLeft) {
    await ctx.db.run('update chats set status = ?, updated_at = ? where chat_id = ?', [
      'discovered',
      nowIso(),
      row.chat_id,
    ]);
  }
  await ctx.log.info('group unbound', { chatId: row.chat_id, channel, source: 'settings' });
  return {
    status: 200,
    body: {
      toast: `Unbound ${channel}. Messages from this target no longer mirror.`,
      refresh: true,
    },
  };
};

function readChannelBody(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    return '';
  }
  const channel = (body as { channel?: unknown }).channel;
  return typeof channel === 'string' ? channel : '';
}

/** Routing card: every connection with live agent name, thread mode and status. */
export const bindings: RouteHandler = async (_params, ctx: AddonContext) => {
  const all = await ctx.db.all('select * from connections order by updated_at desc');
  const rows = all.filter(isConnectionRow);
  const agents = await ctx.agents.list();
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const rowsOut = await Promise.all(
    rows.map(async (row) => {
      const view = await ctx.threads.get({ threadId: row.thread_id });
      return {
        channel: row.channel,
        target: row.topic_id === null ? row.chat_id : `${row.chat_id} · ${row.topic_id}`,
        agent: agentNames.get(row.agent_id) ?? row.agent_id,
        thread: view?.title ?? row.thread_title,
        mode: view?.responderMode ?? 'auto',
        status: statusOf(row),
        threadId: row.thread_id,
        updatedAt: row.updated_at,
      };
    }),
  );
  return { status: 200, body: { rows: rowsOut } };
};
