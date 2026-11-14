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
  title: z.string().optional(),
});

/**
 * Binds a discovered group or forum topic to a fresh thread of the chosen
 * agent. Replaces the first-message auto-bind with an explicit admin decision.
 */
export const connect: RouteHandler = async (params, ctx: AddonContext) => {
  const parsed = ConnectBodySchema.safeParse(asCall(params).request.body);
  if (!parsed.success) {
    throw invalid('body must be { chat, topic?, agentId, title? }');
  }
  const body = parsed.data;
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
  const thread = await ctx.threads.create({ agentId: body.agentId, title: threadTitle });
  await ctx.bindings.bind({ provider: 'telegram', channel, threadId: thread.threadId });
  await ctx.db.run('update chats set status = ?, updated_at = ? where chat_id = ?', [
    'bound',
    new Date().toISOString(),
    chat.chatId,
  ]);
  await ctx.log.info('group connected', {
    chatId: chat.chatId,
    channel,
    threadId: thread.threadId,
  });
  const place =
    topicTitle === null ? displayTitleOf(chat) : `${displayTitleOf(chat)} · ${topicTitle}`;
  return {
    status: 200,
    body: {
      toast: `Connected ${place}. Messages matching the routing policy reach the new thread.`,
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
