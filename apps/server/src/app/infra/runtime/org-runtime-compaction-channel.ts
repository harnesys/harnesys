import type {
  CompactionOutcome,
  CompactionRequest,
  CompactionRequestSettle,
  RunEventFeed,
  RunLifecycleStore,
  SessionEvent,
} from 'harnesys';
import { RUN_NON_TERMINAL } from 'harnesys';
import {
  enqueueCompactionRequest,
  hasPendingCompactionRequest,
  readCompactionOutcome,
  readCompactionRequest,
  settleCompactionRequest,
  takePendingCompactionRequest,
  withdrawCompactionRequest,
} from '../org-sqlite/compaction-request.store.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';

export interface CompactionChannel {
  request: (threadId: string, runId: string) => Promise<CompactionRequest | null>;
  settle: CompactionRequestSettle;
  enqueue: (request: CompactionRequest) => Promise<void>;
  awaitOutcome: (requestId: string, signal?: AbortSignal) => Promise<CompactionOutcome>;
  withdraw: (requestId: string) => Promise<void>;
  hasPending: (threadId: string) => boolean;
}

export interface CompactionChannelDeps {
  db: OrgSqliteDb;
  lifecycle: Pick<RunLifecycleStore, 'get'>;
  feed: Pick<RunEventFeed, 'subscribe'>;
}

interface OutcomeWaiter {
  promise: Promise<CompactionOutcome>;
  resolve: (outcome: CompactionOutcome) => void;
}

interface OutcomeRace {
  promise: Promise<CompactionOutcome>;
  dispose: () => void;
}

const CANCELLED: CompactionOutcome = { compacted: false, reason: 'cancelled' };
const RUN_ENDED: CompactionOutcome = {
  compacted: false,
  error: 'run ended before compaction settled',
};

export function createCompactionChannel(deps: CompactionChannelDeps): CompactionChannel {
  const waiters = new Map<string, OutcomeWaiter>();

  function waiterOf(requestId: string): OutcomeWaiter {
    const existing = waiters.get(requestId);
    if (existing) {
      return existing;
    }
    let resolve: (outcome: CompactionOutcome) => void = () => {};
    const promise = new Promise<CompactionOutcome>((res) => {
      resolve = res;
    });
    const waiter = { promise, resolve };
    waiters.set(requestId, waiter);
    return waiter;
  }

  const settle: CompactionRequestSettle = async (requestId, outcome) => {
    settleCompactionRequest(deps.db, requestId, outcome);
    const waiter = waiters.get(requestId);
    if (waiter) {
      waiters.delete(requestId);
      waiter.resolve(outcome);
    }
  };

  async function awaitOutcome(requestId: string, signal?: AbortSignal): Promise<CompactionOutcome> {
    if (signal?.aborted) {
      return CANCELLED;
    }
    const persisted = readCompactionOutcome(deps.db, requestId);
    if (persisted) {
      return persisted;
    }
    const waiter = waiterOf(requestId);
    const request = readCompactionRequest(deps.db, requestId);
    const terminal = request?.targetRunId
      ? watchRunEnd(deps, request.targetRunId, requestId)
      : undefined;
    const abort = abortRace(signal);
    try {
      const racers = [waiter.promise, abort.promise];
      if (terminal) {
        racers.push(terminal.promise);
      }
      return await Promise.race(racers);
    } finally {
      waiters.delete(requestId);
      abort.dispose();
      terminal?.dispose();
    }
  }

  return {
    request: (threadId, runId) =>
      Promise.resolve(takePendingCompactionRequest(deps.db, threadId, runId)),
    settle,
    enqueue: (request) => {
      enqueueCompactionRequest(deps.db, request);
      return Promise.resolve();
    },
    awaitOutcome,
    withdraw: (requestId) => {
      withdrawCompactionRequest(deps.db, requestId);
      return Promise.resolve();
    },
    hasPending: (threadId) => hasPendingCompactionRequest(deps.db, threadId),
  };
}

function abortRace(signal: AbortSignal | undefined): OutcomeRace {
  if (!signal) {
    return { promise: new Promise<CompactionOutcome>(() => {}), dispose: () => {} };
  }
  let onAbort = () => {};
  const promise = new Promise<CompactionOutcome>((resolve) => {
    onAbort = () => resolve(CANCELLED);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return { promise, dispose: () => signal.removeEventListener('abort', onAbort) };
}

function watchRunEnd(deps: CompactionChannelDeps, runId: string, requestId: string): OutcomeRace {
  let iterator: AsyncIterator<SessionEvent> | undefined;
  let releaseDispose = () => {};
  const disposed = new Promise<void>((resolve) => {
    releaseDispose = resolve;
  });
  const disposeSignal = disposed.then(() => null);
  const settleOrWithdraw = (): CompactionOutcome => {
    const persisted = readCompactionOutcome(deps.db, requestId);
    if (persisted) {
      return persisted;
    }
    withdrawCompactionRequest(deps.db, requestId);
    return RUN_ENDED;
  };
  const promise = (async () => {
    const record = await deps.lifecycle.get(runId);
    if (!record || !RUN_NON_TERMINAL.includes(record.status)) {
      return settleOrWithdraw();
    }
    iterator = deps.feed.subscribe(runId, record.lastSeq ?? 0)[Symbol.asyncIterator]();
    try {
      while (true) {
        const next = await Promise.race([iterator.next(), disposeSignal]);
        if (next === null || next.done) {
          break;
        }
      }
    } finally {
      void iterator.return?.(undefined);
    }
    return settleOrWithdraw();
  })();
  return {
    promise,
    dispose: () => {
      releaseDispose();
      void iterator?.return?.(undefined);
    },
  };
}
