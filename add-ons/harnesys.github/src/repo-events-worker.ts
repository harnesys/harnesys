import { type AddonContext, AddonError, type WorkerPair } from '@harnesys/sdk';
import { GithubRateLimitError } from './github-client.ts';
import { pruneClaims } from './repo-events-state.ts';
import { pollInstances } from './repo-events-streams.ts';
import { listInstances } from './repo-events-trigger.ts';

const WORKER_ID = 'repo-poller';
const LEASE_MS = 120_000;
const IDLE_SLEEP_MS = 5_000;
const CONFIG_SLEEP_MS = 15_000;
const ERROR_SLEEP_MS = 10_000;
const DEFAULT_POLL_SEC = 300;
const POLL_SEC_MIN = 60;
const POLL_SEC_MAX = 3600;
const PRUNE_INTERVAL_MS = 60 * 60_000;
const CLAIM_KEEP_DAYS = 90;

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

async function pollSecOf(ctx: AddonContext): Promise<number> {
  const config = await ctx.config.get(['poll_sec']);
  const raw = Number(config.poll_sec ?? DEFAULT_POLL_SEC);
  if (!Number.isFinite(raw)) {
    return DEFAULT_POLL_SEC;
  }
  return Math.min(Math.max(Math.trunc(raw), POLL_SEC_MIN), POLL_SEC_MAX);
}

async function reportAccountFailure(ctx: AddonContext, error: unknown): Promise<void> {
  if (error instanceof AddonError && error.reason === 'account_failed') {
    await ctx.accounts.report('github', 'invalid_credentials').catch(() => undefined);
  }
}

/** Runs one poll cycle; returns how long to sleep before the next one. */
async function cycle(ctx: AddonContext): Promise<number> {
  const instances = await listInstances(ctx);
  if (instances.length === 0) {
    return CONFIG_SLEEP_MS;
  }
  await pollInstances(ctx, instances);
  return (await pollSecOf(ctx)) * 1000;
}

async function acquireLease(ctx: AddonContext, signal: AbortSignal): Promise<boolean> {
  try {
    return (await ctx.workers.lease(WORKER_ID, LEASE_MS)).held;
  } catch (error) {
    await ctx.log.error('github repo poller lease failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
    await sleep(IDLE_SLEEP_MS, signal);
    return false;
  }
}

async function run(ctx: AddonContext, signal: AbortSignal): Promise<void> {
  let lastPrune = 0;
  while (!signal.aborted) {
    if (!(await acquireLease(ctx, signal))) {
      if (!signal.aborted) {
        await sleep(IDLE_SLEEP_MS, signal);
      }
      continue;
    }
    let waitMs = ERROR_SLEEP_MS;
    try {
      waitMs = await cycle(ctx);
    } catch (error) {
      waitMs = await waitAfterFailure(ctx, error);
    }
    if (Date.now() - lastPrune >= PRUNE_INTERVAL_MS) {
      await pruneClaims(ctx, CLAIM_KEEP_DAYS);
      lastPrune = Date.now();
    }
    await sleep(waitMs, signal);
  }
}

async function waitAfterFailure(ctx: AddonContext, error: unknown): Promise<number> {
  await reportAccountFailure(ctx, error);
  await ctx.log.error('github repo poll cycle failed', {
    reason: error instanceof AddonError ? error.reason : 'internal',
    detail: error instanceof Error ? error.message : String(error),
  });
  if (error instanceof GithubRateLimitError) {
    return Math.max(error.retryAfterMs, ERROR_SLEEP_MS);
  }
  return ERROR_SLEEP_MS;
}

export const repoEventsWorker: WorkerPair = {
  start: async (_params, ctx: AddonContext) => {
    if (controller !== null) {
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    await ctx.workers.report(WORKER_ID, 'running');
    void run(ctx, signal)
      .catch(async (error: unknown) => {
        await ctx.log.error('github repo poller crashed', {
          detail: error instanceof Error ? error.message : String(error),
        });
        await ctx.workers.report(WORKER_ID, 'failed', 'repo_poller_crashed');
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
