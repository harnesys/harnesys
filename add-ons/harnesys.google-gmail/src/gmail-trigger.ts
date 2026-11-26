import { type AddonContext, AddonError, type TriggerPair } from '@harnesys/sdk';
import { clearWatermark, firedOf, pendingCountOf, watermarkOf } from './gmail-store.ts';

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

export const gmailTrigger: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    await ctx.db.run(
      'insert into instances (instance_id, config, started_at) values (?, ?, ?) on conflict(instance_id) do update set config = excluded.config',
      [params.instanceId, JSON.stringify(params.config), new Date().toISOString()],
    );
    await ctx.log.info('gmail message trigger instance started', { instanceId: params.instanceId });
  },
  stop: async (params, ctx: AddonContext) => {
    await ctx.db.run('delete from instances where instance_id = ?', [params.instanceId]);
    await ctx.db.run('delete from fired where instance_id = ?', [params.instanceId]);
    await ctx.log.info('gmail message trigger instance stopped', { instanceId: params.instanceId });
  },
  action: async (params, ctx: AddonContext) => {
    const instance = (await listInstances(ctx)).find(
      (entry) => entry.instanceId === params.instanceId,
    );
    if (instance === undefined) {
      throw new AddonError('not_found', {
        detail: `gmail trigger not found: ${params.instanceId}`,
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

const CONNECTION = 'google';

async function statusOf(instance: StoredInstance, ctx: AddonContext): Promise<unknown> {
  const fired = await firedOf(ctx, instance.instanceId);
  const accounts = await ctx.accounts.list(CONNECTION);
  const watermarks = [];
  for (const account of accounts) {
    const watermark = await watermarkOf(ctx, account.accountId);
    watermarks.push({
      accountId: account.accountId,
      historyId: watermark?.historyId ?? null,
      lastSeenAt: watermark?.lastSeenAt ?? null,
    });
  }
  return {
    instanceId: instance.instanceId,
    query: typeof instance.config.query === 'string' ? instance.config.query : '',
    labels: typeof instance.config.labels === 'string' ? instance.config.labels : '',
    exclude: typeof instance.config.exclude === 'string' ? instance.config.exclude : '',
    startedAt: instance.startedAt,
    accounts: watermarks,
    pending: await pendingCountOf(ctx, instance.instanceId),
    fires: fired.fires,
    lastFiredAt: fired.lastFiredAt,
  };
}

async function resetWatermark(
  instance: StoredInstance,
  input: Record<string, unknown>,
  ctx: AddonContext,
): Promise<unknown> {
  const requested = typeof input.accountId === 'string' ? input.accountId : undefined;
  const accounts = await ctx.accounts.list(CONNECTION);
  const targets =
    requested === undefined
      ? accounts.map((account) => String(account.accountId))
      : accounts.map((account) => String(account.accountId)).filter((id) => id === requested);
  if (requested !== undefined && targets.length === 0) {
    throw new AddonError('not_found', { detail: `google account is not bound: ${requested}` });
  }
  const cleared: string[] = [];
  for (const accountId of targets) {
    if (await clearWatermark(ctx, accountId)) {
      cleared.push(accountId);
    }
  }
  await ctx.log.info('gmail trigger watermark reset', {
    instanceId: instance.instanceId,
    cleared,
  });
  return {
    instanceId: instance.instanceId,
    cleared,
    note: 'the next poll re-baselines to the current Gmail historyId without replaying messages',
  };
}

function inputOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
