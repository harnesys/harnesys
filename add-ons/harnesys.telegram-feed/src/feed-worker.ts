import type { AddonContext, WorkerPair } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { type FeedCredentials, feedCredentials } from './credentials.ts';
import { listInstances, type StoredInstance } from './feed-trigger.ts';
import { channelsOf, filterOf, matchesFilter, parseList } from './filter.ts';
import { type FeedClient, openFeedClient, type RawPost, type ResolvedPeer } from './mtproto.ts';

const WORKER_ID = 'feed-poller';
const CONNECTION = 'telegram-user';
const LEASE_MS = 120_000;
const IDLE_SLEEP_MS = 5_000;
const CONFIG_SLEEP_MS = 15_000;
const ERROR_SLEEP_MS = 10_000;
const HISTORY_LIMIT = 20;
const MAX_TASK_CHARS = 3800;
const PRUNE_INTERVAL_MS = 60 * 60_000;
const POST_KEEP_PER_PEER = 500;
const POST_MAX_AGE_DAYS = 30;

interface PollConfig {
  creds: FeedCredentials;
  channels: string[];
  pollSec: number;
  backfill: number;
}

let controller: AbortController | null = null;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), min), max) : min;
}

async function pollConfigOf(ctx: AddonContext): Promise<PollConfig | null> {
  const config = await ctx.config.get(['channels', 'poll_sec', 'backfill']);
  const channels = channelsOf(config);
  if (channels.length === 0) {
    await ctx.log.warn('telegram feed has no channels configured');
    return null;
  }
  let creds: FeedCredentials;
  try {
    creds = await feedCredentials(ctx);
  } catch (error) {
    await ctx.log.warn('telegram feed account is not ready', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  const pollSec = clamp(Number(config.poll_sec ?? 120), 30, 3600);
  const backfill = clamp(Number(config.backfill ?? 0), 0, HISTORY_LIMIT);
  return { creds, channels, pollSec, backfill };
}

async function watermarkOf(ctx: AddonContext, peer: string): Promise<number | null> {
  const row = await ctx.db.get(
    'select last_post_id as lastPostId from source_watermark where peer = ?',
    [peer],
  );
  return row === null ? null : Number(row.lastPostId ?? 0);
}

async function setWatermark(ctx: AddonContext, peer: string, postId: number): Promise<void> {
  await ctx.db.run(
    'insert into source_watermark (peer, last_post_id, updated_at) values (?, ?, ?) on conflict(peer) do update set last_post_id = excluded.last_post_id, updated_at = excluded.updated_at',
    [peer, postId, new Date().toISOString()],
  );
}

async function rememberSource(
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

async function storePost(ctx: AddonContext, peer: string, post: RawPost): Promise<void> {
  await ctx.db.run(
    'insert or ignore into posts (peer, post_id, text, published_at, received_at) values (?, ?, ?, ?, ?)',
    [peer, post.postId, post.text, post.publishedAt, new Date().toISOString()],
  );
}

function taskTextOf(resolved: ResolvedPeer, post: RawPost): string {
  const topic = post.topicId === null ? '' : ` · topic ${post.topicId}`;
  const link =
    resolved.username === null
      ? ''
      : `https://t.me/${resolved.username}/${post.postId}${
          post.topicId === null ? '' : `?thread=${post.topicId}`
        }`;
  const lines = [
    `Telegram post from ${resolved.title} (#${post.postId}${topic})`,
    `Published ${post.publishedAt}`,
    post.mediaKind === null ? '' : `Media: ${post.mediaKind}`,
    link === '' ? '' : `Link: ${link}`,
  ].filter((line) => line.length > 0);
  const body =
    post.text.length > MAX_TASK_CHARS ? `${post.text.slice(0, MAX_TASK_CHARS)}...` : post.text;
  return `${lines.join('\n')}\n\n${body}`;
}

interface FireInput {
  peer: string;
  resolved: ResolvedPeer;
  post: RawPost;
  instances: StoredInstance[];
  ignoreStart: boolean;
}

async function fireInstances(ctx: AddonContext, input: FireInput): Promise<void> {
  const { peer, resolved, post, instances, ignoreStart } = input;
  const lowerPeer = peer.toLowerCase();
  for (const instance of instances) {
    if (!ignoreStart && post.publishedAt < instance.startedAt) {
      continue;
    }
    const sources = parseList(instance.config.sources);
    if (sources.length > 0 && !sources.includes(lowerPeer)) {
      continue;
    }
    if (!matchesFilter(filterOf(instance.config), post.text)) {
      continue;
    }
    const runKey = `${instance.instanceId}:${peer}:${post.postId}`;
    const claim = await ctx.db.run(
      'insert or ignore into fired (run_key, instance_id, at) values (?, ?, ?)',
      [runKey, instance.instanceId, new Date().toISOString()],
    );
    if (claim.changes === 0) {
      continue;
    }
    const result = await ctx.triggers.fire({
      instanceId: instance.instanceId,
      runKey,
      text: taskTextOf(resolved, post),
      payload: {
        peer,
        postId: post.postId,
        topicId: post.topicId,
        mediaKind: post.mediaKind,
        publishedAt: post.publishedAt,
      },
    });
    if (result.outcome === 'fired') {
      await ctx.db.run('update posts set fires = fires + 1 where peer = ? and post_id = ?', [
        peer,
        post.postId,
      ]);
      continue;
    }
    await ctx.db.run('delete from fired where run_key = ?', [runKey]);
  }
}

async function resolvePeer(
  client: FeedClient,
  cache: Map<string, ResolvedPeer>,
  peer: string,
): Promise<ResolvedPeer | null> {
  const cached = cache.get(peer);
  if (cached !== undefined) {
    return cached;
  }
  const resolved = await client.resolve(peer);
  cache.set(peer, resolved);
  return resolved;
}

interface PollInput {
  client: FeedClient;
  config: PollConfig;
  cache: Map<string, ResolvedPeer>;
  instances: StoredInstance[];
}

async function pollOnce(ctx: AddonContext, input: PollInput): Promise<void> {
  const { client, config, cache, instances } = input;
  for (const peer of config.channels) {
    const resolved = await resolvePeer(client, cache, peer).catch(async (error: unknown) => {
      await ctx.log.warn('telegram feed channel did not resolve', {
        peer,
        detail: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (resolved === null) {
      continue;
    }
    await rememberSource(ctx, peer, resolved);
    const posts = await client.fetchLatest(resolved, HISTORY_LIMIT);
    if (posts.length === 0) {
      continue;
    }
    const firstSight = (await watermarkOf(ctx, peer)) === null;
    if (firstSight && config.backfill === 0) {
      await setWatermark(ctx, peer, posts[posts.length - 1]?.postId ?? 0);
      continue;
    }
    const candidates = firstSight ? posts.slice(-config.backfill) : posts;
    for (const post of candidates) {
      await storePost(ctx, peer, post);
      await fireInstances(ctx, { peer, resolved, post, instances, ignoreStart: firstSight });
    }
    await setWatermark(ctx, peer, posts[posts.length - 1]?.postId ?? 0);
  }
}

async function prune(ctx: AddonContext): Promise<void> {
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

async function reportAccountFailure(ctx: AddonContext, error: unknown): Promise<void> {
  if (!(error instanceof AddonError) || error.reason !== 'account_failed') {
    return;
  }
  await ctx.accounts.report(CONNECTION, 'invalid_credentials').catch(() => undefined);
}

interface WorkerState {
  client: FeedClient | null;
  cache: Map<string, ResolvedPeer>;
  lastPrune: number;
}

async function acquireLease(ctx: AddonContext, signal: AbortSignal): Promise<boolean> {
  try {
    return (await ctx.workers.lease(WORKER_ID, LEASE_MS)).held;
  } catch (error) {
    await ctx.log.error('telegram feed lease failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
    await sleep(ERROR_SLEEP_MS, signal);
    return false;
  }
}

async function runCycle(
  ctx: AddonContext,
  signal: AbortSignal,
  state: WorkerState,
  config: PollConfig,
): Promise<void> {
  try {
    state.client ??= await openFeedClient(config.creds);
    const instances = await listInstances(ctx);
    await pollOnce(ctx, { client: state.client, config, cache: state.cache, instances });
    if (Date.now() - state.lastPrune >= PRUNE_INTERVAL_MS) {
      await prune(ctx);
      state.lastPrune = Date.now();
    }
    await sleep(config.pollSec * 1000, signal);
  } catch (error) {
    state.cache.clear();
    await state.client?.close().catch(() => undefined);
    state.client = null;
    await reportAccountFailure(ctx, error);
    await ctx.log.error('telegram feed poll failed', {
      reason: error instanceof AddonError ? error.reason : 'internal',
      detail: error instanceof Error ? error.message : String(error),
    });
    await sleep(ERROR_SLEEP_MS, signal);
  }
}

async function run(ctx: AddonContext, signal: AbortSignal): Promise<void> {
  const state: WorkerState = { client: null, cache: new Map(), lastPrune: 0 };
  while (!signal.aborted) {
    if (!(await acquireLease(ctx, signal))) {
      if (!signal.aborted) {
        await sleep(IDLE_SLEEP_MS, signal);
      }
      continue;
    }
    const config = await pollConfigOf(ctx);
    if (config === null) {
      await sleep(CONFIG_SLEEP_MS, signal);
      continue;
    }
    await runCycle(ctx, signal, state, config);
  }
  await state.client?.close().catch(() => undefined);
}

export const feedWorker: WorkerPair = {
  start: async (_params, ctx: AddonContext) => {
    if (controller !== null) {
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    await ctx.workers.report(WORKER_ID, 'running');
    void run(ctx, signal)
      .catch(async (error: unknown) => {
        await ctx.log.error('telegram feed worker crashed', {
          detail: error instanceof Error ? error.message : String(error),
        });
        await ctx.workers.report(WORKER_ID, 'failed', 'feed_worker_crashed');
      })
      .finally(() => {
        controller = null;
      });
  },
  stop: async (_params, ctx: AddonContext) => {
    controller?.abort();
    controller = null;
    await ctx.workers.release(WORKER_ID);
    await ctx.workers.report(WORKER_ID, 'stopped');
  },
};
