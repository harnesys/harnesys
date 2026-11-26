import type { AddonContext } from '@harnesys/sdk';
import type { RawPost, ResolvedPeer } from './telegram-types.ts';

const POST_KEEP_PER_PEER = 500;
const POST_MAX_AGE_DAYS = 30;

export async function watermarkOf(ctx: AddonContext, peer: string): Promise<number | null> {
  const row = await ctx.db.get(
    'select last_post_id as lastPostId from source_watermark where peer = ?',
    [peer],
  );
  return row === null ? null : Number(row.lastPostId ?? 0);
}

export async function setWatermark(ctx: AddonContext, peer: string, postId: number): Promise<void> {
  await ctx.db.run(
    'insert into source_watermark (peer, last_post_id, updated_at) values (?, ?, ?) on conflict(peer) do update set last_post_id = excluded.last_post_id, updated_at = excluded.updated_at',
    [peer, postId, new Date().toISOString()],
  );
}

export async function rememberSource(
  ctx: AddonContext,
  peer: string,
  resolved: ResolvedPeer,
): Promise<void> {
  await ctx.db.run(
    `insert into sources (peer, title, added_at, username, peer_id, access_hash, kind)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict(peer) do update set title = excluded.title, username = excluded.username,
       peer_id = excluded.peer_id, access_hash = excluded.access_hash, kind = excluded.kind`,
    [
      peer,
      resolved.title,
      new Date().toISOString(),
      resolved.username,
      resolved.peerId,
      resolved.accessHash,
      resolved.kind,
    ],
  );
}

export async function storePost(ctx: AddonContext, peer: string, post: RawPost): Promise<void> {
  await ctx.db.run(
    'insert or ignore into posts (peer, post_id, text, published_at, received_at) values (?, ?, ?, ?, ?)',
    [peer, post.postId, post.text, post.publishedAt, new Date().toISOString()],
  );
}

export async function pruneFeedPosts(ctx: AddonContext): Promise<void> {
  const cutoff = new Date(Date.now() - POST_MAX_AGE_DAYS * 86_400_000).toISOString();
  await ctx.db.run('delete from posts where received_at < ?', [cutoff]);
  const peers = await ctx.db.all('select peer from posts group by peer');
  for (const row of peers) {
    const peer = String(row.peer);
    await ctx.db.run(
      'delete from posts where peer = ? and post_id not in (select post_id from posts where peer = ? order by received_at desc limit ?)',
      [peer, peer, POST_KEEP_PER_PEER],
    );
  }
  await ctx.db.run('delete from fired where at < ?', [cutoff]);
}

export interface SourceState {
  peer: string;
  title: string | null;
  lastPostId: number | null;
  posts: number;
}

export async function sourceStatesOf(ctx: AddonContext, peers: string[]): Promise<SourceState[]> {
  const states: SourceState[] = [];
  for (const peer of peers) {
    const row = await ctx.db.get(
      'select s.title as title, w.last_post_id as lastPostId from sources s left join source_watermark w on w.peer = s.peer where s.peer = ?',
      [peer],
    );
    const counts = await ctx.db.get('select count(*) as posts from posts where peer = ?', [peer]);
    states.push({
      peer,
      title: typeof row?.title === 'string' ? row.title : null,
      lastPostId:
        row?.lastPostId === null || row?.lastPostId === undefined ? null : Number(row.lastPostId),
      posts: Number(counts?.posts ?? 0),
    });
  }
  return states;
}

export async function clearSourceWatermark(ctx: AddonContext, peer: string): Promise<boolean> {
  const result = await ctx.db.run('delete from source_watermark where peer = ?', [peer]);
  return result.changes > 0;
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
