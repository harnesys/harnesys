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
const WAIT_CHUNK_MS = 60_000;
const DEFAULT_POLL_SEC = 60;
const MIN_POLL_SEC = 30;
const MAX_POLL_SEC = 3600;
const JITTER_RATIO = 0.15;
const RATE_LIMIT_BASE_MS = 30_000;
const RATE_LIMIT_MAX_MS = 600_000;
const ONE_HOUR_MS = 60 * 60_000;

interface WorkerState {
  rateBackoffMs: number;
  lastPrune: number;
  nextPollAt: number;
  pollingDisabled: boolean;
}

interface PollSettings {
  pollSec: number;
  disabled: boolean;
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

function pollSettingsOf(config: Record<string, unknown>): PollSettings {
  const raw = Number(config.poll_sec);
  const pollSec = Number.isFinite(raw)
    ? Math.min(Math.max(Math.trunc(raw), MIN_POLL_SEC), MAX_POLL_SEC)
    : DEFAULT_POLL_SEC;
  return {
    pollSec,
    disabled: config.poll_disabled === true || config.poll_disabled === 'true',
  };
}

async function prune(ctx: AddonContext, state: WorkerState): Promise<void> {
  if (Date.now() - state.lastPrune < ONE_HOUR_MS) {
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

async function pausedByConfig(
  ctx: AddonContext,
  signal: AbortSignal,
  state: WorkerState,
  settings: PollSettings,
): Promise<boolean> {
  if (!settings.disabled) {
    if (state.pollingDisabled) {
      state.pollingDisabled = false;
      await ctx.log.info('gmail polling resumed by config');
    }
    return false;
  }
  if (!state.pollingDisabled) {
    state.pollingDisabled = true;
    await ctx.log.info('gmail polling paused by config');
  }
  state.nextPollAt = 0;
  await sleep(CONFIG_SLEEP_MS, signal);
  return true;
}

async function waitForNextPoll(signal: AbortSignal, state: WorkerState): Promise<boolean> {
  const now = Date.now();
  if (state.nextPollAt <= now) {
    return false;
  }
  await sleep(Math.min(state.nextPollAt - now, WAIT_CHUNK_MS), signal);
  return true;
}

async function runCycle(ctx: AddonContext, signal: AbortSignal, state: WorkerState): Promise<void> {
  try {
    const settings = pollSettingsOf(await ctx.config.get(['poll_sec', 'poll_disabled']));
    if (await pausedByConfig(ctx, signal, state, settings)) {
      return;
    }
    if (await waitForNextPoll(signal, state)) {
      return;
    }
    const accounts = await ctx.accounts.list(CONNECTION);
    if (accounts.length === 0) {
      await ctx.log.warn('gmail poller has no bound google accounts');
      state.nextPollAt = Date.now() + jittered(CONFIG_SLEEP_MS);
      return;
    }
    const instances = await listInstances(ctx);
    for (const account of accounts) {
      await pollAccount(ctx, account.accountId, instances);
    }
    state.rateBackoffMs = 0;
    state.nextPollAt = Date.now() + jittered(settings.pollSec * 1000);
    await prune(ctx, state);
  } catch (error) {
    await reportAccountFailure(ctx, error);
    if (error instanceof AddonError && error.reason === 'rate_limited') {
      state.rateBackoffMs =
        state.rateBackoffMs === 0
          ? RATE_LIMIT_BASE_MS
          : Math.min(state.rateBackoffMs * 2, RATE_LIMIT_MAX_MS);
      state.nextPollAt = Date.now() + jittered(state.rateBackoffMs);
      await ctx.log.warn('gmail poll rate limited, backing off', {
        backoffMs: state.rateBackoffMs,
      });
      return;
    }
    state.nextPollAt = Date.now() + jittered(ERROR_SLEEP_MS);
    await ctx.log.error('gmail poll failed', {
      reason: error instanceof AddonError ? error.reason : 'internal',
      detail: error instanceof Error ? error.message : String(error),
    });
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
  const state: WorkerState = {
    rateBackoffMs: 0,
    lastPrune: 0,
    nextPollAt: 0,
    pollingDisabled: false,
  };
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
