import { type AddonContext, AddonError, type TriggerPair } from '@harnesys/sdk';
import { clearSourceWatermark, firedOf, sourceStatesOf } from './feed-store.ts';
import { channelsOf, parseList } from './filter.ts';

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
  action: async (params, ctx: AddonContext) => {
    const instance = (await listInstances(ctx)).find(
      (entry) => entry.instanceId === params.instanceId,
    );
    if (instance === undefined) {
      throw new AddonError('not_found', {
        detail: `telegram feed trigger not found: ${params.instanceId}`,
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
  const channels = await channelsOf(await ctx.config.get(['channels']));
  return {
    instanceId: instance.instanceId,
    sources: parseList(instance.config.sources),
    match: typeof instance.config.match === 'string' ? instance.config.match : '',
    keywords: typeof instance.config.keywords === 'string' ? instance.config.keywords : '',
    exclude: typeof instance.config.exclude === 'string' ? instance.config.exclude : '',
    startedAt: instance.startedAt,
    channels: await sourceStatesOf(ctx, channels),
    fires: fired.fires,
    lastFiredAt: fired.lastFiredAt,
  };
}

async function resetWatermark(
  instance: StoredInstance,
  input: Record<string, unknown>,
  ctx: AddonContext,
): Promise<unknown> {
  const channels = await channelsOf(await ctx.config.get(['channels']));
  const requested = typeof input.peer === 'string' ? input.peer.toLowerCase() : undefined;
  const targets = channels.filter(
    (peer) => requested === undefined || peer.toLowerCase() === requested,
  );
  if (requested !== undefined && targets.length === 0) {
    throw new AddonError('not_found', {
      detail: `telegram feed channel is not configured: ${input.peer}`,
    });
  }
  const cleared: string[] = [];
  for (const peer of targets) {
    if (await clearSourceWatermark(ctx, peer)) {
      cleared.push(peer);
    }
  }
  await ctx.log.info('telegram feed watermark reset', {
    instanceId: instance.instanceId,
    cleared,
  });
  return {
    instanceId: instance.instanceId,
    cleared,
    note: 'the next poll treats the channel as first sight: it baselines silently unless the add-on backfill config is above zero',
  };
}

function inputOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
