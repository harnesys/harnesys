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
