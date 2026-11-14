import type { AddonContext } from '@harnesys/sdk';
import type { MissPolicy } from './planner.ts';

export interface ScheduleTarget {
  threadId: string;
  agentId: string;
  modeId?: string;
}

export interface ScheduleRow {
  instanceId: string;
  name: string;
  cron: string;
  detail: string;
  missPolicy: MissPolicy;
  status: 'active' | 'failed';
  nextRunAt: string | null;
  lastFiredAt: string | null;
  error: string | null;
  target: ScheduleTarget;
}

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseTarget(raw: unknown): ScheduleTarget {
  const parsed = parseJson(raw);
  return {
    threadId: typeof parsed.threadId === 'string' ? parsed.threadId : '',
    agentId: typeof parsed.agentId === 'string' ? parsed.agentId : '',
    ...(typeof parsed.modeId === 'string' ? { modeId: parsed.modeId } : {}),
  };
}

function configText(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === 'string' ? value : '';
}

function missPolicyOf(config: Record<string, unknown>): MissPolicy {
  const value = config.miss_policy;
  return value === 'skip' || value === 'escalate' ? value : 'catch-up';
}

export async function listSchedules(ctx: AddonContext): Promise<ScheduleRow[]> {
  const instanceRows = await ctx.db.all(
    'select instance_id as instanceId, label, config, target from instances',
  );
  const stateById = await stateMap(ctx);
  const rows: ScheduleRow[] = [];
  for (const row of instanceRows) {
    rows.push(scheduleFromRow(row, stateById));
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

interface StateRow {
  cron: string;
  status: 'active' | 'failed';
  nextRunAt: string | null;
  lastFiredAt: string | null;
  error: string | null;
}

async function stateMap(ctx: AddonContext): Promise<Map<string, StateRow>> {
  const stateRows = await ctx.db.all(
    'select instance_id as instanceId, cron, status, next_run_at as nextRunAt, last_fired_at as lastFiredAt, error from schedule_state',
  );
  const byId = new Map<string, StateRow>();
  for (const row of stateRows) {
    byId.set(String(row.instanceId), {
      cron: String(row.cron),
      status: row.status === 'failed' ? 'failed' : 'active',
      nextRunAt: typeof row.nextRunAt === 'string' ? row.nextRunAt : null,
      lastFiredAt: typeof row.lastFiredAt === 'string' ? row.lastFiredAt : null,
      error: typeof row.error === 'string' ? row.error : null,
    });
  }
  return byId;
}

function scheduleFromRow(
  row: Record<string, unknown>,
  stateById: Map<string, StateRow>,
): ScheduleRow {
  const config = parseJson(row.config);
  const instanceId = String(row.instanceId);
  const label = typeof row.label === 'string' ? row.label : '';
  const state = stateById.get(instanceId);
  return {
    instanceId,
    name: label || configText(config, 'name') || instanceId,
    cron: state?.cron ?? configText(config, 'cron'),
    detail: configText(config, 'detail'),
    missPolicy: missPolicyOf(config),
    status: state?.status ?? 'active',
    nextRunAt: state?.nextRunAt ?? null,
    lastFiredAt: state?.lastFiredAt ?? null,
    error: state?.error ?? null,
    target: parseTarget(row.target),
  };
}

export async function upsertInstance(
  ctx: AddonContext,
  instanceId: string,
  label: string,
  config: Record<string, unknown>,
  target: unknown,
): Promise<void> {
  await ctx.db.run(
    'insert into instances (instance_id, label, config, target, started_at) values (?, ?, ?, ?, ?) on conflict(instance_id) do update set label = excluded.label, config = excluded.config, target = excluded.target',
    [
      instanceId,
      label,
      JSON.stringify(config),
      JSON.stringify(target ?? {}),
      new Date().toISOString(),
    ],
  );
}

export async function removeInstance(ctx: AddonContext, instanceId: string): Promise<void> {
  await ctx.db.run('delete from instances where instance_id = ?', [instanceId]);
  await ctx.db.run(
    "update schedule_state set status = 'paused', next_run_at = null, updated_at = ? where instance_id = ?",
    [new Date().toISOString(), instanceId],
  );
}

export async function markFailed(
  ctx: AddonContext,
  instanceId: string,
  error: string,
): Promise<void> {
  await ctx.db.run(
    "update schedule_state set status = 'failed', error = ?, next_run_at = null, updated_at = ? where instance_id = ?",
    [error, new Date().toISOString(), instanceId],
  );
}

export async function saveState(
  ctx: AddonContext,
  params: {
    instanceId: string;
    cron: string;
    status: 'active' | 'failed';
    nextRunAt: string | null;
    error: string | null;
  },
): Promise<void> {
  await ctx.db.run(
    'insert into schedule_state (instance_id, cron, status, next_run_at, last_fired_at, error, updated_at) values (?, ?, ?, ?, null, ?, ?) on conflict(instance_id) do update set cron = excluded.cron, status = excluded.status, next_run_at = excluded.next_run_at, error = excluded.error, updated_at = excluded.updated_at',
    [
      params.instanceId,
      params.cron,
      params.status,
      params.nextRunAt,
      params.error,
      new Date().toISOString(),
    ],
  );
}

export async function recordFire(
  ctx: AddonContext,
  instanceId: string,
  firedAt: string,
): Promise<void> {
  await ctx.db.run(
    'update schedule_state set last_fired_at = ?, error = null, updated_at = ? where instance_id = ?',
    [firedAt, new Date().toISOString(), instanceId],
  );
}
