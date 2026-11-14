import type { AddonContext } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { checkSendWindow, type SendLimitReason, type SendLimits } from './send-limits.ts';

const DAY_MS = 86_400_000;
const RETENTION_MS = 7 * DAY_MS;

const REASON_TEXT: Record<SendLimitReason, string> = {
  interval: 'minimum interval between sends',
  hour: 'hourly send cap',
  day: 'daily send cap',
};

export async function assertSendAllowed(
  ctx: AddonContext,
  limits: SendLimits,
  chat: string,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - DAY_MS).toISOString();
  const limit = Math.max(limits.maxPerDay, limits.maxPerHour) + 1;
  const rows = await ctx.db.all(
    'select at, chat from send_log where at >= ? order by at desc limit ?',
    [cutoff, limit],
  );
  const recent = rows.map((row) => String(row.at));
  const chatRecent = rows.filter((row) => String(row.chat) === chat).map((row) => String(row.at));
  const verdict = checkSendWindow(limits, { recent, chatRecent, now });
  if (verdict.allowed) {
    return;
  }
  const reason = verdict.reason === null ? 'hour' : verdict.reason;
  throw new AddonError('rate_limited', {
    retryable: true,
    detail: `send to ${chat} blocked by the ${REASON_TEXT[reason]} (min_send_interval_ms ${limits.minIntervalMs}, max_sends_per_hour ${limits.maxPerHour}, max_sends_per_day ${limits.maxPerDay}); retry_after ${verdict.retryAfterSec}s`,
  });
}

export async function recordSend(ctx: AddonContext, chat: string, now: Date): Promise<void> {
  await ctx.db.run('insert into send_log (at, chat) values (?, ?)', [now.toISOString(), chat]);
  await ctx.db.run('delete from send_log where at < ?', [
    new Date(now.getTime() - RETENTION_MS).toISOString(),
  ]);
}
