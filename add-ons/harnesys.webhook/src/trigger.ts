import type { AddonContext, TriggerPair } from '@harnesys/sdk';
import { generateSecret } from './auth.ts';
import { parseHookConfig } from './config.ts';
import { ensureToken, pauseWebhook, secretKeyFor, startWebhook } from './store.ts';

export const webhookTrigger: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    const instanceId = params.instanceId;
    const label = typeof params.label === 'string' ? params.label : '';
    const rawConfig = params.config ?? {};
    await startWebhook(ctx, instanceId, label, rawConfig);
    const token = await ensureToken(ctx, instanceId);
    const config = parseHookConfig(rawConfig);
    if (config.auth !== 'none') {
      const key = secretKeyFor(instanceId);
      if ((await ctx.secrets.get(key)) === null) {
        await ctx.secrets.set(key, generateSecret());
      }
    }
    await ctx.log.info('webhook instance started', { instanceId, token });
  },
  stop: async (params, ctx: AddonContext) => {
    await pauseWebhook(ctx, params.instanceId);
    await ctx.log.info('webhook instance paused', { instanceId: params.instanceId });
  },
};
