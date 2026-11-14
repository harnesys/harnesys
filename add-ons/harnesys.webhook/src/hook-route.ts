import type { AddonContext, RouteHandler, RouteRequest } from '@harnesys/sdk';
import { webhookTaskText } from '@harnesys/studio-shared/webhook-prompt';
import { checkAuth } from './auth.ts';
import type { HookConfig } from './config.ts';
import { checkDedupe, type DedupKeys, type DedupSource, writeDedupe } from './dedupe.ts';
import {
  findByToken,
  markFailed,
  markFired,
  recordDelivery,
  secretKeyFor,
  type WebhookRecord,
} from './store.ts';
import { extractText } from './text.ts';
import { TOKEN_PATTERN, tokenFromPath } from './url.ts';

export interface HookResult {
  status: number;
  body: unknown;
  outcome: string;
}

function sourceOf(request: RouteRequest): DedupSource {
  return {
    method: request.method,
    headers: request.headers,
    query: request.query,
    body: request.body,
    rawBody: request.rawBody ?? '',
  };
}

interface DeliverInput {
  origin: 'hook' | 'test';
  outcome: string;
  status: number;
  body: unknown;
  runId?: string | null;
  summary?: string;
  error?: string;
  latencyMs?: number;
}

async function deliver(
  ctx: AddonContext,
  webhook: WebhookRecord,
  source: DedupSource,
  input: DeliverInput,
): Promise<HookResult> {
  await recordDelivery(ctx, {
    instanceId: webhook.instanceId,
    source: input.origin,
    method: source.method,
    outcome: input.outcome,
    httpStatus: input.status,
    runId: input.runId ?? null,
    summary: input.summary ?? '',
    error: input.error ?? '',
    latencyMs: input.latencyMs ?? 0,
  });
  return { status: input.status, body: input.body, outcome: input.outcome };
}

async function verifyAuth(
  ctx: AddonContext,
  webhook: WebhookRecord,
  source: DedupSource,
): Promise<HookResult | null> {
  if (webhook.config.auth === 'none') {
    return null;
  }
  const secret = await ctx.secrets.get(secretKeyFor(webhook.instanceId));
  const rejection = await checkAuth(webhook.config, secret, source.headers, source.rawBody);
  if (!rejection) {
    return null;
  }
  const outcome = rejection.status === 500 ? 'failed' : 'rejected';
  return deliver(ctx, webhook, source, {
    origin: 'hook',
    outcome,
    status: rejection.status,
    body: { error: rejection.error },
    error: rejection.error,
  });
}

function firedResponse(
  config: HookConfig,
  runId: string | null,
): { status: number; body: unknown } {
  if (config.respondMode !== 'custom') {
    return { status: 202, body: { status: 'fired', runId } };
  }
  try {
    return { status: config.responseStatus, body: JSON.parse(config.responseBody) as unknown };
  } catch {
    return { status: config.responseStatus, body: { text: config.responseBody } };
  }
}

export async function executeDelivery(
  ctx: AddonContext,
  webhook: WebhookRecord,
  request: RouteRequest,
  origin: 'hook' | 'test',
): Promise<HookResult> {
  const config = webhook.config;
  const source = sourceOf(request);
  if (webhook.status !== 'active') {
    return deliver(ctx, webhook, source, {
      origin,
      outcome: 'paused',
      status: 202,
      body: { status: 'paused' },
    });
  }

  let keys: DedupKeys = { idemKey: '', hashKey: '', thrKey: '' };
  if (origin === 'hook') {
    const dedupe = await checkDedupe(ctx, config, webhook.instanceId, source);
    keys = dedupe.keys;
    if (dedupe.rejection?.kind === 'replay') {
      return deliver(ctx, webhook, source, {
        origin,
        outcome: 'deduped',
        status: 200,
        body: { status: dedupe.rejection.outcome },
      });
    }
    if (dedupe.rejection?.kind === 'throttled') {
      return deliver(ctx, webhook, source, {
        origin,
        outcome: 'throttled',
        status: 429,
        body: { error: 'throttled' },
      });
    }
  }

  const text = extractText(config, source) || config.detail;
  const taskText = webhookTaskText(webhook.name, text || undefined);
  const fireStartedAt = Date.now();
  const result = await ctx.triggers.fire({
    instanceId: webhook.instanceId,
    runKey: crypto.randomUUID(),
    text: taskText,
  });
  const latencyMs = Date.now() - fireStartedAt;
  const runId = typeof result.runId === 'string' ? result.runId : null;

  let statusText = '';
  let outcome = '';
  let status = 0;
  let body: unknown = null;
  let error = '';
  if (result.outcome === 'failed') {
    await markFailed(ctx, webhook.instanceId, 'dispatch failed');
    statusText = 'failed';
    outcome = 'failed';
    status = 500;
    body = { error: 'webhook fire failed' };
    error = 'dispatch failed';
  } else if (result.outcome === 'busy') {
    statusText = 'queued-behind-active-run';
    outcome = 'queued';
    status = 202;
    body = { status: statusText };
  } else if (result.outcome === 'suppressed') {
    statusText = 'paused';
    outcome = 'suppressed';
    status = 202;
    body = { status: statusText };
  } else {
    await markFired(ctx, webhook.instanceId);
    const response = firedResponse(config, runId);
    statusText = 'fired';
    outcome = 'fired';
    status = response.status;
    body = response.body;
  }
  if (origin === 'hook') {
    await writeDedupe(ctx, keys, webhook.instanceId, statusText);
  }
  return deliver(ctx, webhook, source, {
    origin,
    outcome,
    status,
    body,
    summary: text.slice(0, 160),
    error,
    runId,
    latencyMs,
  });
}

async function handleHook(request: RouteRequest, ctx: AddonContext): Promise<HookResult> {
  const token = tokenFromPath(request.path);
  if (!TOKEN_PATTERN.test(token)) {
    return { status: 404, body: { error: 'webhook not found' }, outcome: 'rejected' };
  }
  const webhook = await findByToken(ctx, token);
  if (!webhook) {
    return { status: 404, body: { error: 'webhook not found' }, outcome: 'rejected' };
  }
  const source = sourceOf(request);
  if (request.method === 'GET' && !webhook.config.allowGet) {
    return deliver(ctx, webhook, source, {
      origin: 'hook',
      outcome: 'rejected',
      status: 405,
      body: { error: 'method not allowed' },
      error: 'method not allowed',
    });
  }
  const rejected = await verifyAuth(ctx, webhook, source);
  if (rejected) {
    return rejected;
  }
  return executeDelivery(ctx, webhook, request, 'hook');
}

export const hook: RouteHandler = async (call, ctx: AddonContext) => {
  const result = await handleHook(call.request, ctx);
  return { status: result.status, body: result.body };
};

export const hookGet: RouteHandler = async (call, ctx: AddonContext) => {
  const result = await handleHook(call.request, ctx);
  return { status: result.status, body: result.body };
};
