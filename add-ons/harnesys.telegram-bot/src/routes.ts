import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { z } from 'zod';
import { normalizeCode, pairCodeMatches } from './pair-code.ts';

const PairBodySchema = z.object({ code: z.string().min(1).max(64) });
const ChatIdSchema = z.string().min(1);

function invalid(detail: string): AddonError {
  return new AddonError('invalid_params', { detail });
}

function segmentsOf(params: Parameters<RouteHandler>[0]): string[] {
  return params.request.path.split('/').filter((segment) => segment.length > 0);
}

export const chats: RouteHandler = async (_params, ctx: AddonContext) => {
  const rows = await ctx.db.all(
    'select chat_id as chatId, user_id as userId, status, updated_at as updatedAt from pairings order by updated_at desc limit 200',
  );
  const bindings = await ctx.bindings.channels('telegram');
  const threadByChat = new Map(bindings.map((binding) => [binding.channel, binding.threadId]));
  return {
    status: 200,
    body: {
      rows: rows.map((row) => {
        const chatId = String(row.chatId);
        return {
          id: chatId,
          user: row.userId,
          status: row.status,
          threadId: threadByChat.get(chatId) ?? '',
          updatedAt: row.updatedAt,
        };
      }),
    },
  };
};

export const pair: RouteHandler = async (params, ctx: AddonContext) => {
  const parsed = PairBodySchema.safeParse(params.request.body);
  if (!parsed.success) {
    throw invalid('body must be { code: string }');
  }
  const code = normalizeCode(parsed.data.code);
  const rows = await ctx.db.all(
    'select chat_id as chatId, code_hash as codeHash, expires_at as expiresAt from pairings where status = ?',
    ['pending'],
  );
  const now = Date.now();
  for (const row of rows) {
    if (typeof row.codeHash !== 'string' || typeof row.expiresAt !== 'string') {
      continue;
    }
    if (!pairCodeMatches(code, row.codeHash, row.expiresAt, now)) {
      continue;
    }
    const chatId = String(row.chatId);
    await ctx.db.run('update pairings set status = ?, updated_at = ? where chat_id = ?', [
      'paired',
      new Date().toISOString(),
      chatId,
    ]);
    await ctx.log.info('chat paired', { chatId });
    return {
      status: 200,
      body: {
        toast: `Paired chat ${chatId}. Send a message there to connect it to its thread.`,
        refresh: true,
      },
    };
  }
  throw invalid('Pair code is invalid or expired.');
};

export const unbind: RouteHandler = async (params, ctx: AddonContext) => {
  const segments = segmentsOf(params);
  if (segments.length !== 3 || segments[0] !== 'chats' || segments[2] !== 'unbind') {
    throw invalid('expected POST /chats/:id/unbind');
  }
  const chatId = segments[1] ?? '';
  const parsed = ChatIdSchema.safeParse(chatId);
  if (!parsed.success) {
    throw invalid('chat id is required');
  }
  const removed = await ctx.db.run('delete from pairings where chat_id = ?', [chatId]);
  if (removed.changes === 0) {
    throw new AddonError('not_found', { detail: `chat ${chatId} is not paired` });
  }
  await ctx.log.info('chat unpaired', { chatId });
  return { status: 200, body: { toast: `Unpaired chat ${chatId}.`, refresh: true } };
};
