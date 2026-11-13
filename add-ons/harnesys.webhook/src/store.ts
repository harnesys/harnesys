import type { AddonContext } from '@harnesys/sdk';

export interface WebhookRow {
  instanceId: string;
  name: string;
  detail: string;
  status: 'active' | 'paused';
  lastFiredAt: string | null;
  fires: number;
}

interface WebhookRecord extends WebhookRow {
  config: Record<string, unknown>;
}

function parseConfig(raw: unknown): Record<string, unknown> {
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

function text(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === 'string' ? value : '';
}

function mapRow(row: Record<string, unknown>): WebhookRecord {
  const config = parseConfig(row.config);
  return {
    instanceId: String(row.instanceId),
    config,
    name: text(config, 'name'),
    detail: text(config, 'detail'),
    status: row.status === 'paused' ? 'paused' : 'active',
    lastFiredAt: typeof row.last_fired_at === 'string' ? row.last_fired_at : null,
    fires: typeof row.fires === 'number' ? row.fires : 0,
  };
}

export async function listWebhooks(ctx: AddonContext): Promise<WebhookRow[]> {
  const rows = await ctx.db.all(
    'select instance_id as instanceId, config, status, last_fired_at as lastFiredAt, fires from webhooks order by instance_id',
  );
  return rows.map(mapRow);
}

export async function findWebhook(
  ctx: AddonContext,
  instanceId: string,
): Promise<WebhookRecord | null> {
  const row = await ctx.db.get(
    'select instance_id as instanceId, config, status, last_fired_at as lastFiredAt, fires from webhooks where instance_id = ?',
    [instanceId],
  );
  return row ? mapRow(row) : null;
}

export async function upsertWebhook(
  ctx: AddonContext,
  instanceId: string,
  config: Record<string, unknown>,
): Promise<void> {
  await ctx.db.run(
    "insert into webhooks (instance_id, config, status, updated_at) values (?, ?, 'active', ?) on conflict(instance_id) do update set config = excluded.config, status = 'active', updated_at = excluded.updated_at",
    [instanceId, JSON.stringify(config), new Date().toISOString()],
  );
}

export async function pauseWebhook(ctx: AddonContext, instanceId: string): Promise<void> {
  await ctx.db.run('update webhooks set status = ?, updated_at = ? where instance_id = ?', [
    'paused',
    new Date().toISOString(),
    instanceId,
  ]);
}

export async function recordFire(
  ctx: AddonContext,
  instanceId: string,
  firedAt: string,
): Promise<void> {
  await ctx.db.run(
    'update webhooks set last_fired_at = ?, fires = fires + 1, updated_at = ? where instance_id = ?',
    [firedAt, new Date().toISOString(), instanceId],
  );
}
