import type { AddonContext } from '@harnesys/sdk';
import { sha256Hex } from './auth.ts';
import type { HookConfig } from './config.ts';
import { dedupCleanup, dedupGet, dedupPut } from './store.ts';
import { canonicalQuery } from './text.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface DedupKeys {
  idemKey: string;
  hashKey: string;
  thrKey: string;
}

export interface DedupSource {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  rawBody: string;
}

export type DedupRejection = { kind: 'replay'; outcome: string } | { kind: 'throttled' } | null;

function basisOf(source: DedupSource): string {
  if (source.method === 'GET') {
    return canonicalQuery(source.query);
  }
  if (source.rawBody) {
    return source.rawBody;
  }
  return typeof source.body === 'string' ? source.body : '';
}

async function dedupKeys(
  config: HookConfig,
  instanceId: string,
  source: DedupSource,
): Promise<DedupKeys> {
  const idem = config.honorIdempotencyKey ? (source.headers['idempotency-key'] ?? '') : '';
  return {
    idemKey: idem ? `idem:${instanceId}:${idem}` : '',
    hashKey:
      config.dedupeWindowSec > 0 ? `hash:${instanceId}:${await sha256Hex(basisOf(source))}` : '',
    thrKey: config.throttleSec > 0 ? `thr:${instanceId}` : '',
  };
}

function isLive(createdMs: number, windowMs: number, nowMs: number): boolean {
  return createdMs + windowMs > nowMs;
}

export async function checkDedupe(
  ctx: AddonContext,
  config: HookConfig,
  instanceId: string,
  source: DedupSource,
): Promise<{ keys: DedupKeys; rejection: DedupRejection }> {
  const nowMs = Date.now();
  await dedupCleanup(ctx, nowMs - DAY_MS);
  const keys = await dedupKeys(config, instanceId, source);
  if (keys.idemKey) {
    const hit = await dedupGet(ctx, keys.idemKey);
    if (hit && isLive(hit.createdMs, DAY_MS, nowMs)) {
      return { keys, rejection: { kind: 'replay', outcome: hit.outcome } };
    }
  }
  if (keys.hashKey) {
    const hit = await dedupGet(ctx, keys.hashKey);
    if (hit && isLive(hit.createdMs, config.dedupeWindowSec * 1000, nowMs)) {
      return { keys, rejection: { kind: 'replay', outcome: hit.outcome } };
    }
  }
  if (keys.thrKey) {
    const hit = await dedupGet(ctx, keys.thrKey);
    if (hit && isLive(hit.createdMs, config.throttleSec * 1000, nowMs)) {
      return { keys, rejection: { kind: 'throttled' } };
    }
  }
  return { keys, rejection: null };
}

export async function writeDedupe(
  ctx: AddonContext,
  keys: DedupKeys,
  instanceId: string,
  statusText: string,
): Promise<void> {
  if (keys.idemKey) {
    await dedupPut(ctx, keys.idemKey, instanceId, statusText);
  }
  if (keys.hashKey) {
    await dedupPut(ctx, keys.hashKey, instanceId, statusText);
  }
  if (keys.thrKey) {
    await dedupPut(ctx, keys.thrKey, instanceId, statusText);
  }
}
