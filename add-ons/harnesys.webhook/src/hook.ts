import type { AddonContext, RouteHandler, TriggerPair } from '@harnesys/sdk';
import { webhookTaskText } from '@harnesys/studio-shared/webhook-prompt';
import { findWebhook, listWebhooks, pauseWebhook, recordFire, upsertWebhook } from './store.ts';

const ADDON_ID = 'harnesys.webhook';

export function endpointPath(orgId: string, instanceId: string): string {
  return `/addons/public/${orgId}/${ADDON_ID}/r/${instanceId}`;
}

export function instanceIdFromPath(path: string): string {
  return path.replace(/^\/+/, '').split('/')[0] ?? '';
}

export const webhookTrigger: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    await upsertWebhook(ctx, params.instanceId, params.config);
    await ctx.log.info('webhook instance started', { instanceId: params.instanceId });
  },
  stop: async (params, ctx: AddonContext) => {
    await pauseWebhook(ctx, params.instanceId);
    await ctx.log.info('webhook instance paused', { instanceId: params.instanceId });
  },
};

/**
 * Public POST /:instanceId handler. Mirrors the core webhook fire semantics:
 * paused → 202 {status:'paused'}, busy thread → 202
 * {status:'queued-behind-active-run'} (no run created), success → 202
 * {status:'fired'}.
 */
export const hook: RouteHandler = async (call, ctx: AddonContext) => {
  const instanceId = instanceIdFromPath(call.request.path);
  if (!instanceId) {
    return { status: 404, body: { error: 'webhook not found' } };
  }
  const webhook = await findWebhook(ctx, instanceId);
  if (!webhook) {
    return { status: 404, body: { error: 'webhook not found' } };
  }
  if (webhook.status !== 'active') {
    return { status: 202, body: { status: 'paused' } };
  }
  const payload = payloadText(call.request.body);
  const result = await ctx.triggers.fire({
    instanceId,
    runKey: crypto.randomUUID(),
    text: webhookTaskText(webhook.name, payload || webhook.detail || undefined),
  });
  if (result.outcome === 'failed') {
    await ctx.log.error('webhook fire failed', { instanceId });
    return { status: 500, body: { error: 'webhook fire failed' } };
  }
  if (result.outcome === 'busy') {
    // Core parity: a busy thread reports queued-behind-active-run without
    // creating a run and without touching lastFiredAt.
    return { status: 202, body: { status: 'queued-behind-active-run' } };
  }
  if (result.outcome === 'suppressed') {
    return { status: 202, body: { status: 'paused' } };
  }
  await recordFire(ctx, instanceId, new Date().toISOString());
  return { status: 202, body: { status: 'fired', runId: result.runId ?? null } };
};

export const instances: RouteHandler = async (_request, ctx: AddonContext) => {
  const orgId = ctx.meta.orgId ?? '';
  const rows = await listWebhooks(ctx);
  return {
    status: 200,
    body: {
      rows: rows.map((row) => ({
        instanceId: row.instanceId,
        name: row.name,
        endpoint: orgId ? endpointPath(orgId, row.instanceId) : `/<orgId>/r/${row.instanceId}`,
        status: row.status,
        lastFiredAt: row.lastFiredAt,
        fires: row.fires,
      })),
    },
  };
};

function payloadText(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const text = (body as Record<string, unknown>).text;
    if (typeof text === 'string') {
      return text;
    }
  }
  return '';
}
