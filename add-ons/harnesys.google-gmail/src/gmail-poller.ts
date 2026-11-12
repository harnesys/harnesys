import type { AddonContext, WorkerPair } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { pruneFired } from './gmail-store.ts';
import { pollAccount } from './gmail-sync.ts';
import { listInstances } from './gmail-trigger.ts';

const WORKER_ID = 'gmail-mail-poller';
const CONNECTION = 'google';
const LEASE_MS = 120_000;
const IDLE_SLEEP_MS = 5_000;
const CONFIG_SLEEP_MS = 30_000;
const ERROR_SLEEP_MS = 15_000;
const POLL_INTERVAL_MS = 60_000;
const JITTER_RATIO = 0.15;
const RATE_LIMIT_BASE_MS = 30_000;
const RATE_LIMIT_MAX_MS = 600_000;

interface WorkerState {
  rateBackoffMs: number;
  lastPrune: number;
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

function jittered(ms: number): number {
  const spread = ms * JITTER_RATIO;
  return Math.round(ms - spread + Math.random() * spread * 2);
}

async function prune(ctx: AddonContext, state: WorkerState): Promise<void> {
  if (Date.now() - state.lastPrune < 60 * 60_000) {
    return;
  }
  await pruneFired(ctx);
  state.lastPrune = Date.now();
}

async function reportAccountFailure(ctx: AddonContext, error: unknown): Promise<void> {
  if (!(error instanceof AddonError) || error.reason !== 'account_failed') {
    return;
  }
  await ctx.accounts.report(CONNECTION, 'invalid_credentials').catch(() => undefined);
}

async function runCycle(ctx: AddonContext, signal: AbortSignal, state: WorkerState): Promise<void> {
  try {
    const accounts = await ctx.accounts.list(CONNECTION);
    if (accounts.length === 0) {
      await ctx.log.warn('gmail poller has no bound google accounts');
      await sleep(CONFIG_SLEEP_MS, signal);
      return;
    }
    const instances = await listInstances(ctx);
    for (const account of accounts) {
      await pollAccount(ctx, account.accountId, instances);
    }
    state.rateBackoffMs = 0;
    await prune(ctx, state);
    await sleep(jittered(POLL_INTERVAL_MS), signal);
  } catch (error) {
    await reportAccountFailure(ctx, error);
    if (error instanceof AddonError && error.reason === 'rate_limited') {
      state.rateBackoffMs =
        state.rateBackoffMs === 0
          ? RATE_LIMIT_BASE_MS
          : Math.min(state.rateBackoffMs * 2, RATE_LIMIT_MAX_MS);
      await ctx.log.warn('gmail poll rate limited, backing off', {
        backoffMs: state.rateBackoffMs,
      });
      await sleep(jittered(state.rateBackoffMs), signal);
      return;
    }
    await ctx.log.error('gmail poll failed', {
      reason: error instanceof AddonError ? error.reason : 'internal',
      detail: error instanceof Error ? error.message : String(error),
    });
    await sleep(ERROR_SLEEP_MS, signal);
  }
}

async function acquireLease(ctx: AddonContext, signal: AbortSignal): Promise<boolean> {
  try {
    return (await ctx.workers.lease(WORKER_ID, LEASE_MS)).held;
  } catch (error) {
    await ctx.log.error('gmail poller lease failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
    await sleep(ERROR_SLEEP_MS, signal);
    return false;
  }
}

async function run(ctx: AddonContext, signal: AbortSignal): Promise<void> {
  const state: WorkerState = { rateBackoffMs: 0, lastPrune: 0 };
  while (!signal.aborted) {
    if (!(await acquireLease(ctx, signal))) {
      if (!signal.aborted) {
        await sleep(IDLE_SLEEP_MS, signal);
      }
      continue;
    }
    await runCycle(ctx, signal, state);
  }
}

export const gmailPoller: WorkerPair = {
  start: async (_params, ctx: AddonContext) => {
    if (controller !== null) {
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    await ctx.workers.report(WORKER_ID, 'running');
    void run(ctx, signal)
      .catch(async (error: unknown) => {
        await ctx.log.error('gmail poller worker crashed', {
          detail: error instanceof Error ? error.message : String(error),
        });
        await ctx.workers.report(WORKER_ID, 'failed', 'gmail_poller_crashed');
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
