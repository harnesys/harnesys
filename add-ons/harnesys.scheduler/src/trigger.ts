import type { AddonContext, TriggerPair } from '@harnesys/sdk';
import { isValidCron, nextCronRunAt } from './cron.ts';
import { removeInstance, saveState, upsertInstance } from './store.ts';

function cronOf(config: Record<string, unknown>): string {
  const value = config.cron;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

export async function orgTimezone(ctx: AddonContext): Promise<string> {
  try {
    const settings = await ctx.org.settings();
    return settings.timezone;
  } catch (error) {
    await ctx.log.warn('org settings unavailable, falling back to UTC', {
      err: error instanceof Error ? error.message : String(error),
    });
    return 'UTC';
  }
}

export const schedulerTrigger: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    const cron = cronOf(params.config);
    await upsertInstance(ctx, params.instanceId, params.config, params.target);
    const timezone = await orgTimezone(ctx);
    if (!isValidCron(cron, timezone)) {
      await saveState(ctx, {
        instanceId: params.instanceId,
        cron,
        status: 'failed',
        nextRunAt: null,
        error: `invalid cron: ${cron}`,
      });
      await ctx.log.warn('scheduler instance started with an invalid cron', {
        instanceId: params.instanceId,
        cron,
      });
      return;
    }
    try {
      const nextRunAt = nextCronRunAt(cron, new Date(), timezone);
      await saveState(ctx, {
        instanceId: params.instanceId,
        cron,
        status: 'active',
        nextRunAt,
        error: null,
      });
      await ctx.log.info('scheduler instance started', {
        instanceId: params.instanceId,
        cron,
        nextRunAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'cron computation failed';
      await saveState(ctx, {
        instanceId: params.instanceId,
        cron,
        status: 'failed',
        nextRunAt: null,
        error: message,
      });
    }
  },
  stop: async (params, ctx: AddonContext) => {
    await removeInstance(ctx, params.instanceId);
    await ctx.log.info('scheduler instance stopped', { instanceId: params.instanceId });
  },
};
