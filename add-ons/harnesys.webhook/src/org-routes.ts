import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { generateSecret } from './auth.ts';
import type { HookAuth } from './config.ts';
import { executeDelivery } from './hook-route.ts';
import { findByToken, listDeliveries, listWebhooks, rotateToken, secretKeyFor } from './store.ts';
import { endpointUrl, tokenFromPath } from './url.ts';

function authLabel(auth: HookAuth): string {
  if (auth === 'hmac') {
    return 'HMAC';
  }
  return auth === 'apiKey' ? 'API key' : 'None';
}

export const instances: RouteHandler = async (call, ctx: AddonContext) => {
  const orgId = ctx.meta.orgId ?? '';
  const headers = call.request.headers;
  const rows = (await listWebhooks(ctx)).map((webhook) => ({
    id: webhook.token,
    instanceId: webhook.instanceId,
    name: webhook.name || webhook.instanceId,
    token: webhook.token,
    endpoint: webhook.token ? endpointUrl(orgId, webhook.token, headers) : '',
    auth: authLabel(webhook.config.auth),
    status: webhook.status,
    lastFiredAt: webhook.lastFiredAt,
    fires: webhook.fires,
    lastError: webhook.lastError,
  }));
  return { status: 200, body: { rows } };
};

export const deliveries: RouteHandler = async (call, ctx: AddonContext) => {
  const rawLimit = Number.parseInt(call.request.query.limit ?? '', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 40;
  const rows = await listDeliveries(ctx, limit);
  return { status: 200, body: { rows } };
};

async function webhookFromCall(call: Parameters<RouteHandler>[0], ctx: AddonContext) {
  return findByToken(ctx, tokenFromPath(call.request.path));
}

export const rotateUrl: RouteHandler = async (call, ctx: AddonContext) => {
  const webhook = await webhookFromCall(call, ctx);
  if (!webhook) {
    return { status: 404, body: { error: 'webhook not found' } };
  }
  const token = await rotateToken(ctx, webhook.instanceId);
  const endpoint = endpointUrl(ctx.meta.orgId ?? '', token, call.request.headers);
  return { status: 200, body: { toast: `New webhook URL: ${endpoint}`, refresh: true } };
};

export const rotateSecret: RouteHandler = async (call, ctx: AddonContext) => {
  const webhook = await webhookFromCall(call, ctx);
  if (!webhook) {
    return { status: 404, body: { error: 'webhook not found' } };
  }
  const secret = generateSecret();
  await ctx.secrets.set(secretKeyFor(webhook.instanceId), secret);
  return { status: 200, body: { toast: `New secret (shown once): ${secret}`, refresh: true } };
};

function parseSample(sample: string): unknown {
  if (!sample) {
    return undefined;
  }
  try {
    return JSON.parse(sample) as unknown;
  } catch {
    return sample;
  }
}

export const testHook: RouteHandler = async (call, ctx: AddonContext) => {
  const webhook = await webhookFromCall(call, ctx);
  if (!webhook) {
    return { status: 404, body: { error: 'webhook not found' } };
  }
  const sample = webhook.config.samplePayload;
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
  return { status: 200, body: { toast: `Test: ${result.outcome}`, refresh: true } };
};
