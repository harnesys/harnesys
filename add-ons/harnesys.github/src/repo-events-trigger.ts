import { type AddonContext, AddonError, type TriggerPair } from '@harnesys/sdk';
import { clearCursors, cursorsOf, firedOf } from './repo-events-state.ts';

export interface StoredInstance {
  instanceId: string;
  repo: string;
  events: string[];
  branch: string | null;
  labels: string[];
  accountId: string | null;
  startedAt: string;
}

export async function listInstances(ctx: AddonContext): Promise<StoredInstance[]> {
  const rows = await ctx.db.all(
    'select instance_id as instanceId, config, started_at as startedAt from instances',
  );
  return rows.map((row) => instanceOf(row));
}

function instanceOf(row: Record<string, unknown>): StoredInstance {
  let config: Record<string, unknown> = {};
  if (typeof row.config === 'string') {
    try {
      config = JSON.parse(row.config) as Record<string, unknown>;
    } catch {
      config = {};
    }
  }
  return {
    instanceId: String(row.instanceId ?? ''),
    repo: typeof config.repo === 'string' ? config.repo : '',
    events: csvOf(config.events, ['issues', 'pull_requests', 'workflow_runs']),
    branch: typeof config.branch === 'string' && config.branch !== '' ? config.branch : null,
    labels: csvOf(config.labels, []),
    accountId:
      typeof config.accountId === 'string' && config.accountId !== '' ? config.accountId : null,
    startedAt: typeof row.startedAt === 'string' ? row.startedAt : new Date(0).toISOString(),
  };
}

function csvOf(value: unknown, fallback: string[]): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
}

export const repoEventsTrigger: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    await ctx.db.run(
      'insert into instances (instance_id, config, started_at) values (?, ?, ?) on conflict(instance_id) do update set config = excluded.config',
      [params.instanceId, JSON.stringify(params.config), new Date().toISOString()],
    );
    await ctx.log.info('github repo-events instance started', { instanceId: params.instanceId });
  },
  stop: async (params, ctx: AddonContext) => {
    await ctx.db.run('delete from instances where instance_id = ?', [params.instanceId]);
    await ctx.db.run('delete from watermarks where instance_id = ?', [params.instanceId]);
    await ctx.db.run('delete from etags where instance_id = ?', [params.instanceId]);
    await ctx.db.run('delete from fired where instance_id = ?', [params.instanceId]);
    await ctx.log.info('github repo-events instance stopped', { instanceId: params.instanceId });
  },
  action: async (params, ctx: AddonContext) => {
    const instance = (await listInstances(ctx)).find(
      (entry) => entry.instanceId === params.instanceId,
    );
    if (instance === undefined) {
      throw new AddonError('not_found', {
        detail: `github trigger not found: ${params.instanceId}`,
      });
    }
    switch (params.action) {
      case 'status':
        return await statusOf(instance, ctx);
      case 'reset_watermark':
        return await resetWatermark(instance, inputOf(params.input), ctx);
      default:
        throw new AddonError('invalid_params', {
          detail: `unknown action: ${params.action}`,
        });
    }
  },
};

async function statusOf(instance: StoredInstance, ctx: AddonContext): Promise<unknown> {
  const fired = await firedOf(ctx, instance.instanceId);
  return {
    instanceId: instance.instanceId,
    repo: instance.repo,
    events: instance.events,
    branch: instance.branch,
    labels: instance.labels,
    accountId: instance.accountId,
    startedAt: instance.startedAt,
    cursors: await cursorsOf(ctx, instance.instanceId),
    fires: fired.fires,
    lastFiredAt: fired.lastFiredAt,
  };
}

async function resetWatermark(
  instance: StoredInstance,
  input: Record<string, unknown>,
  ctx: AddonContext,
): Promise<unknown> {
  const stream = typeof input.stream === 'string' && input.stream !== '' ? input.stream : undefined;
  const cleared = await clearCursors(ctx, instance.instanceId, stream);
  await ctx.log.info('github trigger watermark reset', {
    instanceId: instance.instanceId,
    cleared,
  });
  return {
    instanceId: instance.instanceId,
    cleared,
    note: 'the next poll re-baselines the cursor without replaying earlier events',
  };
}

function inputOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
