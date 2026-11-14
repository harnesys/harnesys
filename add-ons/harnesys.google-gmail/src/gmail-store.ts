import type { AddonContext } from '@harnesys/sdk';

const FIRED_KEEP_DAYS = 30;
const PENDING_KEEP_DAYS = 7;
const PENDING_MAX_ATTEMPTS = 10;

export interface Watermark {
  historyId: string;
  lastSeenAt: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function pruneFired(ctx: AddonContext): Promise<void> {
  const cutoff = new Date(Date.now() - FIRED_KEEP_DAYS * 86_400_000).toISOString();
  await ctx.db.run('delete from fired where at < ?', [cutoff]);
  const pendingCutoff = new Date(Date.now() - PENDING_KEEP_DAYS * 86_400_000).toISOString();
  await ctx.db.run('delete from pending where first_seen_at < ? or attempts >= ?', [
    pendingCutoff,
    PENDING_MAX_ATTEMPTS,
  ]);
}

export async function watermarkOf(ctx: AddonContext, accountId: string): Promise<Watermark | null> {
  const row = await ctx.db.get(
    'select history_id as historyId, last_seen_at as lastSeenAt from history_watermark where account_id = ?',
    [accountId],
  );
  if (row === null || typeof row.historyId !== 'string' || row.historyId === '') {
    return null;
  }
  return {
    historyId: row.historyId,
    lastSeenAt: typeof row.lastSeenAt === 'string' ? row.lastSeenAt : new Date(0).toISOString(),
  };
}

export async function setWatermark(
  ctx: AddonContext,
  accountId: string,
  historyId: string,
  lastSeenAt: string,
): Promise<void> {
  await ctx.db.run(
    'insert into history_watermark (account_id, history_id, last_seen_at, updated_at) values (?, ?, ?, ?) on conflict(account_id) do update set history_id = excluded.history_id, last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at',
    [accountId, historyId, lastSeenAt, nowIso()],
  );
}

export async function pendingIdsOf(ctx: AddonContext, instanceId: string): Promise<Set<string>> {
  const rows = await ctx.db.all(
    'select message_id as messageId from pending where instance_id = ?',
    [instanceId],
  );
  return new Set(rows.map((row) => String(row.messageId)));
}

export async function pendingDefer(
  ctx: AddonContext,
  instanceId: string,
  messageId: string,
): Promise<void> {
  await ctx.db.run(
    'insert into pending (instance_id, message_id, attempts, first_seen_at) values (?, ?, 1, ?) on conflict(instance_id, message_id) do update set attempts = attempts + 1',
    [instanceId, messageId, nowIso()],
  );
}

export async function pendingResolve(
  ctx: AddonContext,
  instanceId: string,
  messageId: string,
): Promise<void> {
  await ctx.db.run('delete from pending where instance_id = ? and message_id = ?', [
    instanceId,
    messageId,
  ]);
}
