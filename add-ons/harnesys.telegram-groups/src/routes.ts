import type { AddonContext, RouteHandler } from '@harnesys/sdk';
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
 * Binds a discovered group or forum topic to a fresh thread. The responder
 * mode lives on the thread policy (one source of truth): 'auto' creates a
 * chat thread whose pinned agent answers every message, 'mention' creates a
 * group thread that mirrors everything and agents answer on @mentions.
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
    kind: mode === 'mention' ? 'group' : 'chat',
    responderMode: mode,
  });
  await ctx.bindings.bind({ provider: 'telegram', channel, threadId: thread.threadId });
  await ctx.db.run(
    'insert into connections (channel, chat_id, topic_id, agent_id, thread_id, thread_title, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(channel) do update set agent_id = excluded.agent_id, thread_id = excluded.thread_id, thread_title = excluded.thread_title, updated_at = excluded.updated_at',
    [channel, chat.chatId, topicId, body.agentId, thread.threadId, threadTitle, nowIso(), nowIso()],
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
          : `Connected ${place}. Every message reaches the thread agent.`,
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
  updated_at: string;
}

function isConnectionRow(row: unknown): row is ConnectionRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    typeof (row as ConnectionRow).channel === 'string' &&
    typeof (row as ConnectionRow).chat_id === 'string' &&
    typeof (row as ConnectionRow).agent_id === 'string' &&
    typeof (row as ConnectionRow).thread_id === 'string' &&
    typeof (row as ConnectionRow).thread_title === 'string' &&
    typeof (row as ConnectionRow).updated_at === 'string'
  );
}

/** Routing card: every connection with live agent name and thread responder mode. */
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
        threadId: row.thread_id,
        updatedAt: row.updated_at,
      };
    }),
  );
  return { status: 200, body: { rows: rowsOut } };
};
