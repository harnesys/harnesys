import type { AddonContext, TriggerPair } from '@harnesys/sdk';

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
};
