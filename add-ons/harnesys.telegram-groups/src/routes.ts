import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { z } from 'zod';

const RenameBodySchema = z.object({
  chat: z.string().min(1),
  title: z.string().min(1).max(200),
});

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

function segmentsOf(call: RouteCall): string[] {
  return call.request.path.split('/').filter((segment) => segment.length > 0);
}

function asCall(params: unknown): RouteCall {
  return params as RouteCall;
}

function chatAction(call: RouteCall, action: string): string {
  const segments = segmentsOf(call);
  if (segments.length !== 3 || segments[0] !== 'chats' || segments[2] !== action) {
    throw invalid(`expected POST /chats/:id/${action}`);
  }
  const chatId = segments[1] ?? '';
  if (chatId.length === 0) {
    throw invalid('chat id is required');
  }
  return chatId;
}

interface ChatRow {
  chatId: string;
  kind: string;
  title: string;
  titleOverride: string | null;
  status: string;
  updatedAt: string;
}

async function loadChats(ctx: AddonContext): Promise<ChatRow[]> {
  const rows = await ctx.db.all(
    'select chat_id as chatId, kind, title, title_override as titleOverride, status, updated_at as updatedAt from chats order by updated_at desc limit 200',
  );
  return rows.map((row) => ({
    chatId: String(row.chatId),
    kind: String(row.kind),
    title: String(row.title),
    titleOverride: typeof row.titleOverride === 'string' ? row.titleOverride : null,
    status: String(row.status),
    updatedAt: String(row.updatedAt),
  }));
}

async function requireChat(ctx: AddonContext, chatId: string): Promise<ChatRow> {
  const row = await ctx.db.get(
    'select chat_id as chatId, kind, title, title_override as titleOverride, status, updated_at as updatedAt from chats where chat_id = ?',
    [chatId],
  );
  if (row === null) {
    throw new AddonError('not_found', {
      detail: `chat ${chatId} is not registered. Send /start or /join in the group first.`,
    });
  }
  return {
    chatId: String(row.chatId),
    kind: String(row.kind),
    title: String(row.title),
    titleOverride: typeof row.titleOverride === 'string' ? row.titleOverride : null,
    status: String(row.status),
    updatedAt: String(row.updatedAt),
  };
}

export const chats: RouteHandler = async (_params, ctx: AddonContext) => {
  const rows = await loadChats(ctx);
  const bindings = await ctx.bindings.channels('telegram');
  const threadByChat = new Map<string, string>();
  for (const binding of bindings) {
    const base = binding.channel.split(':')[0] ?? binding.channel;
    if (!threadByChat.has(base)) {
      threadByChat.set(base, binding.threadId);
    }
  }
  return {
    status: 200,
    body: {
      rows: rows.map((row) => ({
        id: row.chatId,
        kind: row.kind,
        title: row.titleOverride ?? row.title,
        status: row.status,
        threadId: threadByChat.get(row.chatId) ?? '',
        updatedAt: row.updatedAt,
      })),
    },
  };
};

export const bind: RouteHandler = async (params, ctx: AddonContext) => {
  const chatId = chatAction(asCall(params), 'bind');
  const chat = await requireChat(ctx, chatId);
  await ctx.db.run('update chats set status = ?, updated_at = ? where chat_id = ?', [
    'bound',
    new Date().toISOString(),
    chat.chatId,
  ]);
  await ctx.log.info('group bound', { chatId: chat.chatId });
  return {
    status: 200,
    body: {
      toast: `Bound ${chat.title}. The next matching message connects it to its thread.`,
      refresh: true,
    },
  };
};

export const unbind: RouteHandler = async (params, ctx: AddonContext) => {
  const chatId = chatAction(asCall(params), 'unbind');
  const chat = await requireChat(ctx, chatId);
  await ctx.db.run('update chats set status = ?, updated_at = ? where chat_id = ?', [
    'discovered',
    new Date().toISOString(),
    chat.chatId,
  ]);
  await ctx.log.info('group unbound', { chatId: chat.chatId });
  return { status: 200, body: { toast: `Unbound ${chat.title}.`, refresh: true } };
};

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
