import type { AddonContext, WorkerPair } from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { call, deleteWebhook, getMe, setMyCommands } from './bot-api.ts';
import { botCommands, commandsScope } from './commands.ts';
import { discoverMessage, touchChat, touchTopic } from './discovery.ts';
import { type BotIdentityState, flushChannels, handleGroup } from './inbound.ts';
import { disconnectChat, memberGoneStatus, pruneTopic } from './lifecycle.ts';
import { hasPendingInbox } from './queue-store.ts';
import { groupMessages, type TelegramUpdate } from './telegram.ts';

const WORKER_ID = 'poller';
const LEASE_MS = 60_000;
const IDLE_SLEEP_MS = 5_000;
const ERROR_SLEEP_MS = 3_000;
const CONFLICT_SLEEP_MS = 30_000;
const AUTH_SLEEP_MS = 15_000;
const POLL_TIMEOUT_SEC = 20;
const INBOX_POLL_TIMEOUT_SEC = 3;
const ITERATION_DEADLINE_MS = 120_000;
const MAX_STALLED_ITERATIONS = 2;

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

/**
 * Bounds every host round trip of the loop: a lost RPC response would
 * otherwise hang the poller forever, silently, with the lease expired and the
 * worker still reported running. On the deadline the promise rejects and the
 * loop counts the stall; repeated stalls hand the worker back to the
 * on-failure restart.
 */
function deadline<T>(what: string, run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AddonError('timeout', { detail: `${what} exceeded ${ITERATION_DEADLINE_MS}ms` }));
    }, ITERATION_DEADLINE_MS);
    timer.unref?.();
    run().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
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
    const chat = update.my_chat_member.chat;
    const status = update.my_chat_member.new_chat_member?.status;
    if (chat.type !== 'private') {
      await touchChat(ctx, chat);
      if (memberGoneStatus(status)) {
        await disconnectChat(ctx, String(chat.id), 'bot_removed');
      }
    }
    await ctx.log.info('telegram chat membership changed', {
      chatId: chat.id,
      status: status ?? 'unknown',
    });
    return;
  }
  if (update.forum_topic_created !== undefined) {
    const topic = update.forum_topic_created;
    await touchChat(ctx, topic.chat);
    await touchTopic(ctx, String(topic.chat.id), String(topic.message_thread_id), topic.name);
    return;
  }
  if (update.forum_topic_deleted !== undefined) {
    const topic = update.forum_topic_deleted;
    await pruneTopic(ctx, String(topic.chat.id), String(topic.message_thread_id));
    return;
  }
  if (update.message !== undefined) {
    await discoverMessage(ctx, update.message);
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

async function pollBatch(
  ctx: AddonContext,
  state: PollState,
  identity: BotIdentityState,
): Promise<void> {
  const timeout = (await hasPendingInbox(ctx)) ? INBOX_POLL_TIMEOUT_SEC : POLL_TIMEOUT_SEC;
  const updates = await call<TelegramUpdate[]>(ctx, 'getUpdates', {
    offset: state.offset,
    timeout,
    allowed_updates: ['message', 'my_chat_member', 'forum_topic_created', 'forum_topic_deleted'],
  });
  const messages = [];
  for (const update of updates) {
    await handleUpdate(ctx, update);
    if (update.message !== undefined) {
      messages.push(update.message);
    }
    state.offset = update.update_id + 1;
    await setState(ctx, 'updates_offset', String(state.offset));
  }
  for (const group of groupMessages(messages)) {
    await handleGroup(ctx, group, identity);
  }
  await flushChannels(ctx);
}

async function loadIdentity(ctx: AddonContext): Promise<BotIdentityState> {
  const me = await getMe(ctx);
  const username = typeof me.username === 'string' && me.username.length > 0 ? me.username : null;
  await ctx.log.info('telegram bot connected', { id: me.id, username });
  return { botId: me.id, botUsername: username };
}

async function ensureReady(ctx: AddonContext): Promise<void> {
  await deleteWebhook(ctx, false);
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
    await ctx.log.warn(
      'telegram getUpdates conflict: another poller or webhook owns this bot token',
      {
        detail: error.detail,
      },
    );
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
    return (await deadline('worker lease', () => ctx.workers.lease(WORKER_ID, LEASE_MS))).held;
  } catch (error) {
    await pauseAfterFailure(ctx, signal, error);
    return false;
  }
}

async function pollOnce(
  ctx: AddonContext,
  state: PollState,
  identity: BotIdentityState | null,
): Promise<BotIdentityState> {
  const current =
    identity === null ? await deadline('bot identity', () => loadIdentity(ctx)) : identity;
  await deadline('update poll', () => pollBatch(ctx, state, current));
  return current;
}

async function waitForLease(ctx: AddonContext, signal: AbortSignal): Promise<boolean> {
  if (await acquireLease(ctx, signal)) {
    return true;
  }
  if (!signal.aborted) {
    await sleep(IDLE_SLEEP_MS, signal);
  }
  return false;
}

interface PollFailure {
  stalled: number;
  resetIdentity: boolean;
  restart: boolean;
}

function isTimeout(error: unknown): boolean {
  return error instanceof AddonError && error.reason === 'timeout';
}

async function pollFailure(
  ctx: AddonContext,
  signal: AbortSignal,
  stalled: number,
  error: unknown,
): Promise<PollFailure> {
  await pauseAfterFailure(ctx, signal, error);
  const nextStalled = isTimeout(error) ? stalled + 1 : 0;
  if (nextStalled >= MAX_STALLED_ITERATIONS) {
    await ctx.log.error('telegram poller stalled; handing over to the worker restart', {
      stalls: nextStalled,
    });
    await ctx.workers.report(WORKER_ID, 'failed', 'poller_stalled');
    return { stalled: nextStalled, resetIdentity: false, restart: true };
  }
  return {
    stalled: nextStalled,
    resetIdentity: error instanceof AddonError && error.reason === 'account_failed',
    restart: false,
  };
}

async function pollLoop(
  ctx: AddonContext,
  signal: AbortSignal,
  state: PollState,
  identity: BotIdentityState | null,
): Promise<'aborted' | 'restart'> {
  let current = identity;
  let stalled = 0;
  while (!signal.aborted) {
    if (!(await waitForLease(ctx, signal))) {
      continue;
    }
    try {
      current = await pollOnce(ctx, state, current);
      stalled = 0;
    } catch (error) {
      const failure = await pollFailure(ctx, signal, stalled, error);
      stalled = failure.stalled;
      if (failure.resetIdentity) {
        current = null;
      }
      if (failure.restart) {
        return 'restart';
      }
    }
  }
  return 'aborted';
}

async function run(ctx: AddonContext, signal: AbortSignal): Promise<void> {
  const identity = await initialIdentity(ctx, signal);
  const state: PollState = { offset: 0 };
  try {
    state.offset = await deadline('baseline offset', () => baselineOffset(ctx));
  } catch (error) {
    await pauseAfterFailure(ctx, signal, error);
  }
  await pollLoop(ctx, signal, state, identity);
}

async function initialIdentity(
  ctx: AddonContext,
  signal: AbortSignal,
): Promise<BotIdentityState | null> {
  try {
    await deadline('bot setup', () => ensureReady(ctx));
    return await deadline('bot identity', () => loadIdentity(ctx));
  } catch (error) {
    await pauseAfterFailure(ctx, signal, error);
    return null;
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
