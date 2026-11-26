import type { AddonContext, TriggerPair } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { generateSecret } from './auth.ts';
import { authLabel, parseHookConfig } from './config.ts';
import { executeDelivery } from './hook-route.ts';
import {
  ensureToken,
  findByInstance,
  listDeliveries,
  pauseWebhook,
  rotateToken,
  secretKeyFor,
  startWebhook,
  type WebhookRecord,
} from './store.ts';
import { publicEndpointPath } from './url.ts';

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
  action: async (params, ctx: AddonContext) => {
    const webhook = await requireWebhook(ctx, params.instanceId);
    const input = inputOf(params.input);
    switch (params.action) {
      case 'status':
        return statusOf(webhook, ctx);
      case 'deliveries':
        return { rows: await listDeliveries(ctx, limitOf(input), webhook.instanceId) };
      case 'rotate_url':
        return await rotateUrl(webhook, ctx);
      case 'rotate_secret':
        return await rotateSecret(webhook, ctx);
      case 'test':
        return await test(webhook, input, ctx);
      default:
        throw new AddonError('invalid_params', { detail: `unknown action: ${params.action}` });
    }
  },
};

function statusOf(webhook: WebhookRecord, ctx: AddonContext): Record<string, unknown> {
  return {
    instanceId: webhook.instanceId,
    token: webhook.token,
    endpointPath: webhook.token ? publicEndpointPath(ctx.meta.orgId ?? '', webhook.token) : '',
    auth: authLabel(webhook.config.auth),
    status: webhook.status,
    fires: webhook.fires,
    lastFiredAt: webhook.lastFiredAt,
    lastError: webhook.lastError,
  };
}

async function rotateUrl(webhook: WebhookRecord, ctx: AddonContext): Promise<unknown> {
  const token = await rotateToken(ctx, webhook.instanceId);
  return {
    instanceId: webhook.instanceId,
    token,
    endpointPath: publicEndpointPath(ctx.meta.orgId ?? '', token),
  };
}

async function rotateSecret(webhook: WebhookRecord, ctx: AddonContext): Promise<unknown> {
  const secret = generateSecret();
  await ctx.secrets.set(secretKeyFor(webhook.instanceId), secret);
  return { instanceId: webhook.instanceId, secret };
}

async function test(
  webhook: WebhookRecord,
  input: Record<string, unknown>,
  ctx: AddonContext,
): Promise<unknown> {
  const sample =
    typeof input.body === 'string' && input.body.length > 0
      ? input.body
      : webhook.config.samplePayload;
  const result = await executeDelivery(
    ctx,
    webhook,
    {
      method: 'POST',
      path: `/${webhook.token}`,
      query: {},
      headers: {},
      body: parseSample(sample),
      rawBody: sample,
    },
    'test',
  );
  return { outcome: result.outcome, status: result.status };
}

async function requireWebhook(ctx: AddonContext, instanceId: string): Promise<WebhookRecord> {
  const webhook = await findByInstance(ctx, instanceId);
  if (!webhook) {
    throw new AddonError('not_found', { detail: `webhook not found: ${instanceId}` });
  }
  return webhook;
}

function inputOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function limitOf(input: Record<string, unknown>): number {
  const value = input.limit;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 40;
  }
  return Math.min(200, Math.max(1, Math.floor(value)));
}

function parseSample(raw: string): unknown {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
