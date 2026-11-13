import type { AddonContext, DbRow } from '@harnesys/sdk';
import { generateToken } from './auth.ts';
import { type HookConfig, parseHookConfig } from './config.ts';

export type WebhookStatus = 'active' | 'paused' | 'failed';

export interface WebhookRecord {
  instanceId: string;
  token: string;
  name: string;
  config: HookConfig;
  status: WebhookStatus;
  lastFiredAt: string | null;
  fires: number;
  lastError: string;
}

export interface DeliveryRecord {
  instanceId: string;
  source: 'hook' | 'test';
  method: string;
  outcome: string;
  httpStatus: number;
  runId: string | null;
  summary: string;
  error: string;
  latencyMs: number;
}

export interface DedupHit {
  outcome: string;
  createdMs: number;
}

const SELECT_WEBHOOK =
  'select instance_id as instanceId, token, label, config, status, last_fired_at as lastFiredAt, fires, last_error as lastError from webhooks';

function configJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapWebhook(row: DbRow): WebhookRecord {
  const rawConfig = configJson(row.config);
  const label = typeof row.label === 'string' ? row.label : '';
  const configName = typeof rawConfig.name === 'string' ? rawConfig.name : '';
  const status = row.status === 'paused' || row.status === 'failed' ? row.status : 'active';
  return {
    instanceId: String(row.instanceId ?? ''),
    token: typeof row.token === 'string' ? row.token : '',
    name: label || configName,
    config: parseHookConfig(rawConfig),
    status,
    lastFiredAt: typeof row.lastFiredAt === 'string' ? row.lastFiredAt : null,
    fires: typeof row.fires === 'number' ? row.fires : 0,
    lastError: typeof row.lastError === 'string' ? row.lastError : '',
  };
}

export function secretKeyFor(instanceId: string): string {
  return `secret:${instanceId.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
}

export async function startWebhook(
  ctx: AddonContext,
  instanceId: string,
  label: string,
  config: Record<string, unknown>,
): Promise<void> {
  await ctx.db.run(
    "insert into webhooks (instance_id, label, config, status, updated_at) values (?, ?, ?, 'active', ?) on conflict(instance_id) do update set label = excluded.label, config = excluded.config, status = 'active', last_error = '', updated_at = excluded.updated_at",
    [instanceId, label, JSON.stringify(config), new Date().toISOString()],
  );
}

export async function ensureToken(ctx: AddonContext, instanceId: string): Promise<string> {
  const row = await ctx.db.get('select token from webhooks where instance_id = ?', [instanceId]);
  const existing = typeof row?.token === 'string' ? row.token : '';
  if (existing) {
    return existing;
  }
  return rotateToken(ctx, instanceId);
}

export async function rotateToken(ctx: AddonContext, instanceId: string): Promise<string> {
  const token = generateToken();
  await ctx.db.run('update webhooks set token = ?, updated_at = ? where instance_id = ?', [
    token,
    new Date().toISOString(),
    instanceId,
  ]);
  return token;
}

export async function pauseWebhook(ctx: AddonContext, instanceId: string): Promise<void> {
  await ctx.db.run('update webhooks set status = ?, updated_at = ? where instance_id = ?', [
    'paused',
    new Date().toISOString(),
    instanceId,
  ]);
}

export async function markFired(ctx: AddonContext, instanceId: string): Promise<void> {
  await ctx.db.run(
    "update webhooks set last_fired_at = ?, fires = fires + 1, status = 'active', last_error = '', updated_at = ? where instance_id = ?",
    [new Date().toISOString(), new Date().toISOString(), instanceId],
  );
}

export async function markFailed(
  ctx: AddonContext,
  instanceId: string,
  error: string,
): Promise<void> {
  await ctx.db.run(
    "update webhooks set status = 'failed', last_error = ?, updated_at = ? where instance_id = ?",
    [error, new Date().toISOString(), instanceId],
  );
}

export async function findByToken(ctx: AddonContext, token: string): Promise<WebhookRecord | null> {
  const row = await ctx.db.get(`${SELECT_WEBHOOK} where token = ?`, [token]);
  return row ? mapWebhook(row) : null;
}

export async function listWebhooks(ctx: AddonContext): Promise<WebhookRecord[]> {
  const rows = await ctx.db.all(`${SELECT_WEBHOOK} order by instance_id`);
  return rows.map(mapWebhook);
}

export async function recordDelivery(ctx: AddonContext, delivery: DeliveryRecord): Promise<void> {
  await ctx.db.run(
    'insert into deliveries (id, instance_id, source, method, received_at, outcome, http_status, run_id, summary, error, latency_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      crypto.randomUUID(),
      delivery.instanceId,
      delivery.source,
      delivery.method,
      new Date().toISOString(),
      delivery.outcome,
      delivery.httpStatus,
      delivery.runId,
      delivery.summary.slice(0, 160),
      delivery.error,
      delivery.latencyMs,
    ],
  );
}

export async function listDeliveries(
  ctx: AddonContext,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const rows = await ctx.db.all(
    "select d.id as id, d.received_at as receivedAt, coalesce(nullif(w.label, ''), json_extract(w.config, '$.name'), '') as webhook, d.method as method, d.outcome as outcome, d.summary as summary, d.error as error, d.run_id as runId from deliveries d left join webhooks w on w.instance_id = d.instance_id order by d.received_at desc limit ?",
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id ?? ''),
    receivedAt: String(row.receivedAt ?? ''),
    webhook: String(row.webhook ?? ''),
    method: String(row.method ?? ''),
    outcome: String(row.outcome ?? ''),
    summary: String(row.summary ?? ''),
    error: String(row.error ?? ''),
    runId: typeof row.runId === 'string' ? row.runId : '',
  }));
}

export async function dedupGet(ctx: AddonContext, key: string): Promise<DedupHit | null> {
  const row = await ctx.db.get('select outcome, created_ms as createdMs from dedup where key = ?', [
    key,
  ]);
  if (!row) {
    return null;
  }
  return {
    outcome: String(row.outcome ?? ''),
    createdMs: typeof row.createdMs === 'number' ? row.createdMs : 0,
  };
}

export async function dedupPut(
  ctx: AddonContext,
  key: string,
  instanceId: string,
  outcome: string,
): Promise<void> {
  await ctx.db.run(
    'insert or replace into dedup (key, instance_id, outcome, created_ms) values (?, ?, ?, ?)',
    [key, instanceId, outcome, Date.now()],
  );
}

export async function dedupCleanup(ctx: AddonContext, cutoffMs: number): Promise<void> {
  await ctx.db.run('delete from dedup where created_ms < ?', [cutoffMs]);
}
