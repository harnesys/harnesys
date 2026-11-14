import type { AddonContext, TriggerPair } from '@harnesys/sdk';

export interface StoredInstance {
  instanceId: string;
  config: Record<string, unknown>;
  startedAt: string;
}

export async function listInstances(ctx: AddonContext): Promise<StoredInstance[]> {
  const rows = await ctx.db.all(
    'select instance_id as instanceId, config, started_at as startedAt from instances',
  );
  return rows.map((row) => {
    let config: Record<string, unknown> = {};
    if (typeof row.config === 'string') {
      try {
        config = JSON.parse(row.config) as Record<string, unknown>;
      } catch {
        config = {};
      }
    }
    return {
      instanceId: String(row.instanceId),
      config,
      startedAt: typeof row.startedAt === 'string' ? row.startedAt : new Date(0).toISOString(),
    };
  });
}

export const feedTrigger: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    await ctx.db.run(
      'insert into instances (instance_id, config, started_at) values (?, ?, ?) on conflict(instance_id) do update set config = excluded.config',
      [params.instanceId, JSON.stringify(params.config), new Date().toISOString()],
    );
    await ctx.log.info('telegram feed instance started', { instanceId: params.instanceId });
  },
  stop: async (params, ctx: AddonContext) => {
    await ctx.db.run('delete from instances where instance_id = ?', [params.instanceId]);
    await ctx.db.run('delete from fired where instance_id = ?', [params.instanceId]);
    await ctx.log.info('telegram feed instance stopped', { instanceId: params.instanceId });
  },
};
