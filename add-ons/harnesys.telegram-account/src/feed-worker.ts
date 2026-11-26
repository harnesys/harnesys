import type { AddonContext, WorkerPair } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { type FeedCredentials, feedCredentials } from './credentials.ts';
import { postFieldsOf } from './feed-prompt.ts';
import {
  pruneFeedPosts,
  rememberSource,
  setWatermark,
  storePost,
  watermarkOf,
} from './feed-store.ts';
import { listInstances, type StoredInstance } from './feed-trigger.ts';
import { channelsOf, filterOf, matchesFilter, parseList } from './filter.ts';
import { openFeedClient } from './mtproto.ts';
import { createSingleFlight } from './single-flight.ts';
import type { FeedClient, RawPost, ResolvedPeer } from './telegram-types.ts';
import { withSharedClient } from './tool-client.ts';

const WORKER_ID = 'feed-poller';
const CONNECTION = 'telegram-user';
const LEASE_MS = 120_000;
const IDLE_SLEEP_MS = 5_000;
const CONFIG_SLEEP_MS = 15_000;
const ERROR_SLEEP_MS = 10_000;
const HISTORY_LIMIT = 20;
const MAX_TASK_CHARS = 3800;
const PRUNE_INTERVAL_MS = 60 * 60_000;

interface FeedTarget {
  creds: FeedCredentials;
  channels: string[];
}

interface PollConfig extends FeedTarget {
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

async function configuredChannels(ctx: AddonContext): Promise<string[]> {
  const channels = channelsOf(await ctx.config.get(['channels']));
  if (channels.length === 0) {
    await ctx.log.warn('telegram feed has no channels configured');
  }
  return channels;
}

async function feedTargetOf(ctx: AddonContext): Promise<FeedTarget | null> {
  const channels = await configuredChannels(ctx);
  if (channels.length === 0) {
    return null;
  }
  try {
    return { creds: await feedCredentials(ctx), channels };
  } catch (error) {
    await ctx.log.warn('telegram feed account is not ready', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function pollConfigOf(ctx: AddonContext): Promise<PollConfig | null> {
  const target = await feedTargetOf(ctx);
  if (target === null) {
    return null;
  }
  const config = await ctx.config.get(['poll_sec', 'backfill']);
  const pollSec = clamp(Number(config.poll_sec ?? 120), 30, 3600);
  const backfill = clamp(Number(config.backfill ?? 0), 0, HISTORY_LIMIT);
  return { ...target, pollSec, backfill };
}

async function runSourceSync(ctx: AddonContext): Promise<void> {
  const channels = await configuredChannels(ctx);
  if (channels.length === 0) {
    return;
  }
  await withSharedClient(ctx, async (client) => {
    for (const peer of channels) {
      try {
        const resolved = await client.resolve(peer);
        await rememberSource(ctx, peer, resolved);
      } catch (error) {
        await ctx.log.warn('telegram feed channel did not resolve', {
          peer,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}

export const syncSourcesOnce = createSingleFlight(runSourceSync);

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
    const body =
      post.text.length > MAX_TASK_CHARS ? `${post.text.slice(0, MAX_TASK_CHARS)}...` : post.text;
    const result = await ctx.triggers.fire({
      instanceId: instance.instanceId,
      runKey,
      title: `New post in ${resolved.title}`,
      text: body,
      fields: postFieldsOf(resolved, post),
      payload: {
        peer,
        postId: post.postId,
        topicId: post.topicId,
        mediaKind: post.mediaKind,
        publishedAt: post.publishedAt,
      },
    });
    if (isAcceptedFire(result.outcome)) {
      await ctx.db.run('update posts set fires = fires + 1 where peer = ? and post_id = ?', [
        peer,
        post.postId,
      ]);
      continue;
    }
    await ctx.db.run('delete from fired where run_key = ?', [runKey]);
  }
}

function isAcceptedFire(
  outcome: 'fired' | 'suppressed' | 'busy' | 'failed' | 'script-only',
): boolean {
  return outcome === 'fired' || outcome === 'script-only';
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
      await pruneFeedPosts(ctx);
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
