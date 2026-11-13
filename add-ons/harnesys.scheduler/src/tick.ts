import type { AddonContext, JobHandler } from '@harnesys/sdk';
import { scheduledTaskText } from '@harnesys/studio-shared/schedule-prompt';
import { nextCronRunAt } from './cron.ts';
import { type DueDecision, planDueBatch } from './planner.ts';
import type { ScheduleTarget } from './store.ts';
import { listSchedules, markFailed, recordFire, saveState } from './store.ts';
import { orgTimezone } from './trigger.ts';

const CATCHUP_WINDOW_SEC = 3600;
const CATCHUP_BATCH = 50;

export const tick: JobHandler = async (_params, ctx: AddonContext) => {
  const schedules = (await listSchedules(ctx)).filter(
    (row) => row.status === 'active' && row.nextRunAt !== null,
  );
  if (schedules.length === 0) {
    return;
  }
  const timezone = await orgTimezone(ctx);
  const now = new Date();
  const { planned } = planDueBatch(schedules, {
    now,
    catchupWindowSec: CATCHUP_WINDOW_SEC,
    catchupBatch: CATCHUP_BATCH,
    dueAtOf: (row) => new Date(row.nextRunAt ?? now.toISOString()),
    onlineOf: () => true,
    missPolicyOf: (row) => row.missPolicy,
    scheduleIdOf: (row) => row.instanceId,
  });
  for (const { row, decision } of planned) {
    await handlePlanned(ctx, row, decision, now, timezone);
  }
};

interface PlannedRow {
  instanceId: string;
  name: string;
  cron: string;
  detail: string;
  nextRunAt: string | null;
  target: ScheduleTarget;
}

async function handlePlanned(
  ctx: AddonContext,
  row: PlannedRow,
  decision: DueDecision,
  now: Date,
  timezone: string,
): Promise<void> {
  if (decision.action === 'wait') {
    return;
  }
  if (decision.action === 'miss_stale' || decision.action === 'miss_offline') {
    if (decision.needsInbox) {
      await openMissInbox(ctx, row, decision.action);
    }
    await advance(ctx, row, now, timezone);
    return;
  }
  const scheduledFor = new Date(row.nextRunAt ?? now.toISOString());
  const result = await ctx.triggers.fire({
    instanceId: row.instanceId,
    runKey: decision.fireId ?? `schedule:${row.instanceId}:${scheduledFor.toISOString()}`,
    text: scheduledTaskText(row.name, row.detail),
  });
  if (result.outcome === 'busy') {
    // Core parity: a busy thread keeps its nextRunAt so the run is retried
    // on the next tick inside the catch-up window.
    return;
  }
  if (result.outcome === 'failed') {
    await markFailed(ctx, row.instanceId, 'run dispatch failed');
    await ctx.log.warn('schedule fire failed, instance marked failed', {
      instanceId: row.instanceId,
    });
    return;
  }
  await recordFire(ctx, row.instanceId, now.toISOString());
  if (result.outcome === 'suppressed') {
    await ctx.log.warn('schedule fire suppressed, advancing anyway', {
      instanceId: row.instanceId,
      runKey: decision.fireId,
    });
  }
  await advance(ctx, row, now, timezone);
}

async function advance(
  ctx: AddonContext,
  row: { instanceId: string; cron: string },
  now: Date,
  timezone: string,
): Promise<void> {
  try {
    const nextRunAt = nextCronRunAt(row.cron, now, timezone);
    await saveState(ctx, {
      instanceId: row.instanceId,
      cron: row.cron,
      status: 'active',
      nextRunAt,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'cron computation failed';
    await markFailed(ctx, row.instanceId, message);
  }
}

async function openMissInbox(
  ctx: AddonContext,
  row: PlannedRow,
  reason: 'miss_stale' | 'miss_offline',
): Promise<void> {
  const interruptId = `schedule-miss:${row.instanceId}:${row.nextRunAt ?? 'none'}`;
  try {
    await ctx.approvals.request({
      interruptId,
      agentId: row.target.agentId,
      threadId: row.target.threadId,
      kind: 'question',
      question: `Schedule "${row.name}" missed (${reason === 'miss_stale' ? 'stale' : 'offline'})`,
      options: ['approve', 'deny'],
      context: {
        source: 'schedule',
        note: reason,
        tool: { name: 'schedule.miss', inputPreview: row.cron },
      },
    });
  } catch (error) {
    await ctx.log.warn('miss inbox request failed', {
      instanceId: row.instanceId,
      err: error instanceof Error ? error.message : String(error),
    });
  }
}
