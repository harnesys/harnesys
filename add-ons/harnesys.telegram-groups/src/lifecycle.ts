import type { AddonContext } from '@harnesys/sdk';

/**
 * Connection lifecycle: bindings die with their transport target. A topic
 * deleted in Telegram, a bot removed from the group, or a thread deleted in
 * the app all leave the connection row behind; these helpers mark the row
 * disconnected, drop the transport binding (mirroring stops immediately) and
 * keep the thread itself untouched.
 */

export const CONNECTED = 'connected';
export const DISCONNECTED = 'disconnected';

const MEMBER_GONE_STATUSES: readonly string[] = ['left', 'kicked'];

/** The bot no longer sees the chat: every binding of that chat is dead. */
export function memberGoneStatus(status: string | undefined | null): boolean {
  return status !== undefined && status !== null && MEMBER_GONE_STATUSES.includes(status);
}

export async function disconnectChannel(
  ctx: AddonContext,
  channel: string,
  reason: string,
): Promise<boolean> {
  const row = await ctx.db.get('select channel from connections where channel = ? and status = ?', [
    channel,
    CONNECTED,
  ]);
  if (row === null || typeof row.channel !== 'string') {
    return false;
  }
  await ctx.db.run('update connections set status = ?, updated_at = ? where channel = ?', [
    DISCONNECTED,
    new Date().toISOString(),
    channel,
  ]);
  await ctx.bindings.unbind({ provider: 'telegram', channel });
  await ctx.log.info('connection disconnected', { channel, reason });
  return true;
}

export async function disconnectChat(
  ctx: AddonContext,
  chatId: string,
  reason: string,
): Promise<number> {
  const rows = await ctx.db.all(
    'select channel from connections where chat_id = ? and status = ?',
    [chatId, CONNECTED],
  );
  let count = 0;
  for (const row of rows) {
    if (typeof row.channel !== 'string') {
      continue;
    }
    if (await disconnectChannel(ctx, row.channel, reason)) {
      count += 1;
    }
  }
  if (count > 0) {
    await ctx.db.run('update chats set status = ?, updated_at = ? where chat_id = ?', [
      'discovered',
      new Date().toISOString(),
      chatId,
    ]);
  }
  return count;
}

/** A deleted topic loses its discovery row and its connection, if any. */
export async function pruneTopic(
  ctx: AddonContext,
  chatId: string,
  topicId: string,
): Promise<void> {
  await ctx.db.run('delete from topics where chat_id = ? and topic_id = ?', [chatId, topicId]);
  await disconnectChannel(ctx, `${chatId}:${topicId}`, 'topic_deleted');
}

/**
 * The mirror target must exist before a message is bridged into it: a thread
 * deleted in the app drops the connection instead of failing every poll.
 */
export async function connectionAlive(
  ctx: AddonContext,
  channel: string,
  threadId: string,
): Promise<boolean> {
  const view = await ctx.threads.get({ threadId });
  if (view !== null) {
    return true;
  }
  await disconnectChannel(ctx, channel, 'thread_deleted');
  return false;
}
