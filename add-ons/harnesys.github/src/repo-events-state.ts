import type { AddonContext } from '@harnesys/sdk';

export async function watermarkOf(
  ctx: AddonContext,
  instanceId: string,
  stream: string,
): Promise<string | null> {
  const row = await ctx.db.get(
    'select watermark from watermarks where instance_id = ? and stream = ?',
    [instanceId, stream],
  );
  return row === null ? null : String(row.watermark);
}

export async function setWatermark(
  ctx: AddonContext,
  instanceId: string,
  stream: string,
  value: string,
): Promise<void> {
  await ctx.db.run(
    'insert into watermarks (instance_id, stream, watermark, updated_at) values (?, ?, ?, ?) on conflict(instance_id, stream) do update set watermark = excluded.watermark, updated_at = excluded.updated_at',
    [instanceId, stream, value, new Date().toISOString()],
  );
}

export async function storedEtagOf(
  ctx: AddonContext,
  instanceId: string,
  stream: string,
): Promise<string | undefined> {
  const row = await ctx.db.get('select etag from etags where instance_id = ? and stream = ?', [
    instanceId,
    stream,
  ]);
  return row === null ? undefined : String(row.etag);
}

export async function setEtag(
  ctx: AddonContext,
  instanceId: string,
  stream: string,
  etag: string,
): Promise<void> {
  await ctx.db.run(
    'insert into etags (instance_id, stream, etag, updated_at) values (?, ?, ?, ?) on conflict(instance_id, stream) do update set etag = excluded.etag, updated_at = excluded.updated_at',
    [instanceId, stream, etag, new Date().toISOString()],
  );
}

export async function claimRun(
  ctx: AddonContext,
  runKey: string,
  instanceId: string,
): Promise<boolean> {
  const claim = await ctx.db.run(
    'insert or ignore into fired (run_key, instance_id, at) values (?, ?, ?)',
    [runKey, instanceId, new Date().toISOString()],
  );
  return claim.changes > 0;
}

export async function releaseRun(ctx: AddonContext, runKey: string): Promise<void> {
  await ctx.db.run('delete from fired where run_key = ?', [runKey]);
}

export async function pruneClaims(ctx: AddonContext, maxAgeDays: number): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  await ctx.db.run('delete from fired where at < ?', [cutoff]);
}

export interface StreamCursor {
  stream: string;
  watermark: string | null;
  hasEtag: boolean;
}

export async function cursorsOf(ctx: AddonContext, instanceId: string): Promise<StreamCursor[]> {
  const marks = await ctx.db.all(
    'select stream, watermark from watermarks where instance_id = ? order by stream',
    [instanceId],
  );
  const etags = await ctx.db.all('select stream from etags where instance_id = ?', [instanceId]);
  const cursors = new Map<string, StreamCursor>();
  for (const row of marks) {
    const stream = String(row.stream);
    cursors.set(stream, { stream, watermark: String(row.watermark), hasEtag: false });
  }
  for (const row of etags) {
    const stream = String(row.stream);
    const existing = cursors.get(stream) ?? { stream, watermark: null, hasEtag: false };
    cursors.set(stream, { ...existing, hasEtag: true });
  }
  return [...cursors.values()].sort((left, right) => left.stream.localeCompare(right.stream));
}

export async function firedOf(
  ctx: AddonContext,
  instanceId: string,
): Promise<{ fires: number; lastFiredAt: string | null }> {
  const row = await ctx.db.get(
    'select count(*) as fires, max(at) as lastFiredAt from fired where instance_id = ?',
    [instanceId],
  );
  return {
    fires: Number(row?.fires ?? 0),
    lastFiredAt: typeof row?.lastFiredAt === 'string' ? row.lastFiredAt : null,
  };
}

export async function clearCursors(
  ctx: AddonContext,
  instanceId: string,
  stream?: string,
): Promise<string[]> {
  const cursors = await cursorsOf(ctx, instanceId);
  const targets = cursors
    .filter((cursor) => stream === undefined || cursor.stream === stream)
    .map((cursor) => cursor.stream);
  for (const target of targets) {
    await ctx.db.run('delete from watermarks where instance_id = ? and stream = ?', [
      instanceId,
      target,
    ]);
    await ctx.db.run('delete from etags where instance_id = ? and stream = ?', [
      instanceId,
      target,
    ]);
  }
  return targets;
}
