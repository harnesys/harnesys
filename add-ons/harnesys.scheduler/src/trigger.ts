import type { AddonContext, TriggerPair } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { isValidCron, nextCronRunAt } from './cron.ts';
import {
  listSchedules,
  pauseInstance,
  removeInstance,
  saveState,
  upsertInstance,
} from './store.ts';

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
    await upsertInstance(ctx, {
      instanceId: params.instanceId,
      label: typeof params.label === 'string' ? params.label : '',
      instructions: params.instructions ?? '',
      config: params.config,
      target: params.target,
    });
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
    if (params.reason === 'removed') {
      await removeInstance(ctx, params.instanceId);
      await ctx.log.info('scheduler instance removed', { instanceId: params.instanceId });
      return;
    }
    await pauseInstance(ctx, params.instanceId);
    await ctx.log.info('scheduler instance paused', { instanceId: params.instanceId });
  },
  action: async (params, ctx: AddonContext) => {
    switch (params.action) {
      case 'status':
        return await statusOf(params.instanceId, ctx);
      case 'check_cron':
        return await checkCron(inputOf(params.input), ctx);
      default:
        throw new AddonError('invalid_params', {
          detail: `unknown action: ${params.action}`,
        });
    }
  },
};

async function statusOf(instanceId: string, ctx: AddonContext): Promise<Record<string, unknown>> {
  const row = (await listSchedules(ctx)).find((entry) => entry.instanceId === instanceId);
  if (!row) {
    throw new AddonError('not_found', { detail: `schedule not found: ${instanceId}` });
  }
  return {
    instanceId: row.instanceId,
    name: row.name,
    cron: row.cron,
    missPolicy: row.missPolicy,
    status: row.status,
    nextRunAt: row.nextRunAt,
    lastFiredAt: row.lastFiredAt,
    error: row.error,
    threadId: row.target.threadId,
    agentId: row.target.agentId,
  };
}

async function checkCron(
  input: Record<string, unknown>,
  ctx: AddonContext,
): Promise<Record<string, unknown>> {
  const cron = cronOf(input);
  const timezone = await orgTimezone(ctx);
  if (!cron) {
    return { cron, timezone, valid: false, error: 'cron is required' };
  }
  if (!isValidCron(cron, timezone)) {
    return { cron, timezone, valid: false, error: `invalid cron: ${cron}` };
  }
  try {
    return { cron, timezone, valid: true, nextRunAt: nextCronRunAt(cron, new Date(), timezone) };
  } catch (error) {
    return {
      cron,
      timezone,
      valid: false,
      error: error instanceof Error ? error.message : 'cron computation failed',
    };
  }
}

function inputOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
