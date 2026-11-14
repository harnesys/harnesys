import type { AddonContext, AddonTriggerTarget, ToolHandler } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { generateSecret } from './auth.ts';
import { authLabel, type HookAuth } from './config.ts';
import { executeDelivery } from './hook-route.ts';
import {
  findByInstance,
  findByToken,
  listDeliveries,
  listWebhooks,
  pauseWebhook,
  resumeWebhook,
  rotateToken,
  secretKeyFor,
  type WebhookRecord,
} from './store.ts';
import { publicEndpointPath } from './url.ts';

const AUTH_VALUES: readonly HookAuth[] = ['none', 'hmac', 'apiKey'];
const TEXT_KEYS = ['detail', 'textPath', 'textTemplate', 'samplePayload'] as const;
const NUMBER_KEYS = ['maxTextKb', 'throttleSec', 'dedupeWindowSec'] as const;

function orgId(ctx: AddonContext): string {
  return ctx.meta.orgId ?? '';
}

function str(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalLimit(input: Record<string, unknown>): number {
  const raw = input.limit;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return 40;
  }
  return Math.min(200, Math.max(1, Math.floor(raw)));
}

function optionalAuth(input: Record<string, unknown>): HookAuth | undefined {
  const raw = input.auth;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'string' && AUTH_VALUES.includes(raw as HookAuth)) {
    return raw as HookAuth;
  }
  throw new AddonError('invalid_params', { detail: 'auth must be one of: none, hmac, apiKey' });
}

function buildConfigPatch(input: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const auth = optionalAuth(input);
  if (auth !== undefined) {
    config.auth = auth;
  }
  for (const key of TEXT_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) {
      config[key] = value;
    }
  }
  for (const key of NUMBER_KEYS) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      config[key] = value;
    }
  }
  if (typeof input.allowGet === 'boolean') {
    config.allowGet = input.allowGet;
  }
  return config;
}

function resolveTarget(input: Record<string, unknown>, ctx: AddonContext): AddonTriggerTarget {
  const threadId =
    typeof input.threadId === 'string' && input.threadId ? input.threadId : ctx.meta.threadId;
  const agentId = ctx.meta.agentId;
  if (!threadId || !agentId) {
    throw new AddonError('invalid_params', {
      detail: 'threadId is required and the tool call must carry agent context',
    });
  }
  return { threadId, agentId };
}

async function resolveWebhook(
  ctx: AddonContext,
  input: Record<string, unknown>,
): Promise<WebhookRecord> {
  const key = str(input, 'webhook');
  const webhook = (await findByToken(ctx, key)) ?? (await findByInstance(ctx, key));
  if (!webhook) {
    throw new AddonError('not_found', { detail: `webhook not found: ${key}` });
  }
  return webhook;
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

const list: ToolHandler = async (_input, ctx: AddonContext) => {
  const rows = await listWebhooks(ctx);
  return rows.map((webhook) => ({
    instanceId: webhook.instanceId,
    token: webhook.token,
    name: webhook.name || webhook.instanceId,
    endpointPath: webhook.token ? publicEndpointPath(orgId(ctx), webhook.token) : '',
    auth: authLabel(webhook.config.auth),
    status: webhook.status,
    lastFiredAt: webhook.lastFiredAt,
    fires: webhook.fires,
    lastError: webhook.lastError,
  }));
};

const deliveries: ToolHandler = async (input, ctx: AddonContext) => {
  return { rows: await listDeliveries(ctx, optionalLimit(input)) };
};

const create: ToolHandler = async (input, ctx: AddonContext) => {
  const { instanceId } = await ctx.triggers.create({
    kind: 'webhook.http',
    label: str(input, 'name'),
    config: buildConfigPatch(input),
    target: resolveTarget(input, ctx),
  });
  const webhook = await findByInstance(ctx, instanceId);
  return {
    instanceId,
    token: webhook?.token ?? '',
    endpointPath: webhook?.token ? publicEndpointPath(orgId(ctx), webhook.token) : '',
  };
};

const configure: ToolHandler = async (input, ctx: AddonContext) => {
  const webhook = await resolveWebhook(ctx, input);
  const patch = buildConfigPatch(input);
  await ctx.triggers.update({
    instanceId: webhook.instanceId,
    config: { ...webhook.config, ...patch } as Record<string, unknown>,
  });
  const updated = await findByInstance(ctx, webhook.instanceId);
  return {
    ok: true,
    instanceId: webhook.instanceId,
    status: updated?.status ?? webhook.status,
    auth: authLabel(updated?.config.auth ?? webhook.config.auth),
  };
};

const pause: ToolHandler = async (input, ctx: AddonContext) => {
  const webhook = await resolveWebhook(ctx, input);
  await pauseWebhook(ctx, webhook.instanceId);
  return { ok: true, instanceId: webhook.instanceId, status: 'paused' };
};

const resume: ToolHandler = async (input, ctx: AddonContext) => {
  const webhook = await resolveWebhook(ctx, input);
  await resumeWebhook(ctx, webhook.instanceId);
  return { ok: true, instanceId: webhook.instanceId, status: 'active' };
};

const rotateUrl: ToolHandler = async (input, ctx: AddonContext) => {
  const webhook = await resolveWebhook(ctx, input);
  const token = await rotateToken(ctx, webhook.instanceId);
  return {
    ok: true,
    instanceId: webhook.instanceId,
    endpointPath: publicEndpointPath(orgId(ctx), token),
  };
};

const rotateSecret: ToolHandler = async (input, ctx: AddonContext) => {
  const webhook = await resolveWebhook(ctx, input);
  const secret = generateSecret();
  await ctx.secrets.set(secretKeyFor(webhook.instanceId), secret);
  return { ok: true, instanceId: webhook.instanceId, secret };
};

const test: ToolHandler = async (input, ctx: AddonContext) => {
  const webhook = await resolveWebhook(ctx, input);
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
};

export const webhookTools: Record<string, ToolHandler> = {
  list,
  deliveries,
  create,
  configure,
  pause,
  resume,
  rotate_url: rotateUrl,
  rotate_secret: rotateSecret,
  test,
};
