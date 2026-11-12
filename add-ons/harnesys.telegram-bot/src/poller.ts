import type { AddonContext, WorkerPair } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { call, deleteWebhook, getMe, setMyCommands } from './bot-api.ts';
import { botCommands, commandsScope } from './commands.ts';
import { handleGroup } from './inbound.ts';
import { groupMessages, type TelegramMessage, type TelegramUpdate } from './telegram.ts';

const WORKER_ID = 'poller';
const LEASE_MS = 60_000;
const IDLE_SLEEP_MS = 5_000;
const ERROR_SLEEP_MS = 3_000;
const CONFLICT_SLEEP_MS = 30_000;
const AUTH_SLEEP_MS = 15_000;
const POLL_TIMEOUT_SEC = 20;

interface PollState {
  offset: number;
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

async function stateOf(ctx: AddonContext, key: string): Promise<string | null> {
  const row = await ctx.db.get('select value from bot_state where key = ?', [key]);
  return row === null || typeof row.value !== 'string' ? null : row.value;
}

async function setState(ctx: AddonContext, key: string, value: string): Promise<void> {
  await ctx.db.run(
    'insert into bot_state (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
    [key, value],
  );
}

async function handleUpdate(ctx: AddonContext, update: TelegramUpdate): Promise<void> {
  const seen = await ctx.db.run(
    'insert or ignore into inbound_seen (update_id, at) values (?, ?)',
    [update.update_id, new Date().toISOString()],
  );
  if (seen.changes === 0) {
    return;
  }
  if (update.my_chat_member !== undefined) {
    await ctx.log.info('telegram chat membership changed', {
      chatId: update.my_chat_member.chat.id,
      status: update.my_chat_member.new_chat_member?.status ?? 'unknown',
    });
  }
}

async function baselineOffset(ctx: AddonContext): Promise<number> {
  const stored = await stateOf(ctx, 'updates_offset');
  if (stored !== null) {
    return Number(stored);
  }
  const updates = await call<TelegramUpdate[]>(ctx, 'getUpdates', {
    offset: -1,
    limit: 1,
    timeout: 0,
  });
  const last = updates.at(-1);
  const offset = last === undefined ? 0 : last.update_id + 1;
  await setState(ctx, 'updates_offset', String(offset));
  await ctx.log.info('telegram poll baseline established', { offset });
  return offset;
}

async function pollBatch(ctx: AddonContext, state: PollState): Promise<void> {
  const updates = await call<TelegramUpdate[]>(ctx, 'getUpdates', {
    offset: state.offset,
    timeout: POLL_TIMEOUT_SEC,
    allowed_updates: ['message', 'my_chat_member'],
  });
  const messages: TelegramMessage[] = [];
  for (const update of updates) {
    await handleUpdate(ctx, update);
    if (update.message !== undefined) {
      messages.push(update.message);
    }
    state.offset = update.update_id + 1;
    await setState(ctx, 'updates_offset', String(state.offset));
  }
  for (const group of groupMessages(messages)) {
    await handleGroup(ctx, group);
  }
}

async function ensureReady(ctx: AddonContext): Promise<void> {
  await deleteWebhook(ctx, false);
  const me = await getMe(ctx);
  await ctx.log.info('telegram bot connected', { id: me.id, username: me.username ?? null });
  await setMyCommands(ctx, botCommands(), commandsScope());
}

async function pauseAfterFailure(
  ctx: AddonContext,
  signal: AbortSignal,
  error: unknown,
): Promise<void> {
  if (error instanceof AddonError && error.reason === 'account_failed') {
    await ctx.log.warn('telegram bot account is missing or rejected', { detail: error.detail });
    await sleep(AUTH_SLEEP_MS, signal);
    return;
  }
  if (error instanceof AddonError && error.reason === 'conflict') {
    await ctx.log.warn('telegram getUpdates conflict: another poller or webhook owns this bot', {
      detail: error.detail,
    });
    await sleep(CONFLICT_SLEEP_MS, signal);
    return;
  }
  await ctx.log.error('telegram getUpdates failed', {
    reason: error instanceof AddonError ? error.reason : 'internal',
    detail: error instanceof Error ? error.message : String(error),
  });
  await sleep(ERROR_SLEEP_MS, signal);
}

async function acquireLease(ctx: AddonContext, signal: AbortSignal): Promise<boolean> {
  try {
    return (await ctx.workers.lease(WORKER_ID, LEASE_MS)).held;
  } catch (error) {
    await pauseAfterFailure(ctx, signal, error);
    return false;
  }
}

async function run(ctx: AddonContext, signal: AbortSignal): Promise<void> {
  try {
    await ensureReady(ctx);
  } catch (error) {
    await pauseAfterFailure(ctx, signal, error);
  }
  const state: PollState = { offset: 0 };
  try {
    state.offset = await baselineOffset(ctx);
  } catch (error) {
    await pauseAfterFailure(ctx, signal, error);
  }
  while (!signal.aborted) {
    if (!(await acquireLease(ctx, signal))) {
      if (!signal.aborted) {
        await sleep(IDLE_SLEEP_MS, signal);
      }
      continue;
    }
    try {
      await pollBatch(ctx, state);
    } catch (error) {
      await pauseAfterFailure(ctx, signal, error);
    }
  }
}

export const poller: WorkerPair = {
  start: async (_params, ctx: AddonContext) => {
    if (controller !== null) {
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    await ctx.workers.report(WORKER_ID, 'running');
    void run(ctx, signal)
      .catch(async (error: unknown) => {
        await ctx.log.error('telegram poller crashed', {
          detail: error instanceof Error ? error.message : String(error),
        });
        await ctx.workers.report(WORKER_ID, 'failed', 'poller_crashed');
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
