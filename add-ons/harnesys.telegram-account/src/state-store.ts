import type { AddonContext } from '@harnesys/sdk';

export async function readState(ctx: AddonContext, key: string): Promise<string | null> {
  const row = await ctx.db.get('select value from bot_state where key = ?', [key]);
  return row === null || typeof row.value !== 'string' ? null : row.value;
}

export async function writeState(ctx: AddonContext, key: string, value: string): Promise<void> {
  await ctx.db.run(
    'insert into bot_state (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
    [key, value],
  );
}
