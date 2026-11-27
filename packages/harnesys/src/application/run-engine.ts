import {
  DEFAULT_LEASE_RENEW_MS,
  DEFAULT_LEASE_TTL_MS,
  RUN_NON_TERMINAL,
  RUN_STOP_CANCEL_REASON,
} from '../constants.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Event } from '../domain/snapshot.ts';
import { CONSOLE_LOGGER } from '../ports/logger.ts';
import type { RunLifecycleStatus } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';
import type { GraphOpts } from './graph.ts';
import type {
  BackgroundSpawnHandle,
  BackgroundSpawnRegistry,
  ChildAbortRegistry,
} from './graph-spawn.ts';
import { emitHook, type HookEmitCtx } from './hooks/emit-hook.ts';
import { eventToSessionEvent, runFailedEvent, runStartedEvent } from './run-engine-events.ts';
import { prepareExecuteGraphOpts } from './run-engine-prepare.ts';
import type { SegmentCtx, SegmentEnv } from './run-engine-segment.ts';
import {
  admit,
  failMessageOf,
  flushJournal,
  guardedTransition,
  runSegment,
} from './run-engine-segment.ts';
import {
  DEFAULT_DELIVERY_SETTINGS,
  type DeliverySettings,
  type RunEngine,
  type RunEngineDeps,
  type RunTargetOpts,
} from './run-engine-types.ts';

export type { DeliverySettings, RunEngine, RunEngineDeps, RunTargetOpts };

interface RunRuntime {
  abort: AbortController;
  renewTimer: ReturnType<typeof setInterval> | null;
  leaseLost: boolean;
}
const CHILD_TERMINAL_STATUS: Record<string, RunLifecycleStatus> = {
  'run.completed': 'completed',
  'run.cancelled': 'cancelled',
  'run.failed': 'failed',
};
interface ChildRunJournal {
  tail: Promise<void>;
  epoch: number;
  closed: boolean;
}
function createChildAbortRegistry(): ChildAbortRegistry {
  const bySpawnId = new Map<string, AbortController>();
  return {
    register: (spawnId, controller) => {
      bySpawnId.set(spawnId, controller);
    },
    release: (spawnId) => {
      bySpawnId.delete(spawnId);
    },
    abort: (spawnId, reason) => {
      const controller = bySpawnId.get(spawnId);
      if (controller === undefined) {
        return false;
      }
      controller.abort(reason);
      return true;
    },
  };
}
interface BackgroundSpawnEntry {
  handle: BackgroundSpawnHandle;
  controller: AbortController;
  promise: Promise<BackgroundSpawnHandle>;
}
export function createBackgroundSpawnRegistry(): BackgroundSpawnRegistry {
  const byRun = new Map<string, Map<string, BackgroundSpawnEntry>>();
  const runMap = (runId: string): Map<string, BackgroundSpawnEntry> => {
    let map = byRun.get(runId);
    if (map === undefined) {
      map = new Map();
      byRun.set(runId, map);
    }
    return map;
  };
  const allEntries = (): BackgroundSpawnEntry[] => {
    const entries: BackgroundSpawnEntry[] = [];
    for (const map of byRun.values()) {
      entries.push(...map.values());
    }
    return entries;
  };
  const waitEntries = (
    entries: BackgroundSpawnEntry[],
    timeoutMs?: number,
  ): Promise<BackgroundSpawnHandle[]> => {
    if (entries.length > 0 && timeoutMs === undefined) {
      return Promise.allSettled(entries.map((entry) => entry.promise)).then(() =>
        entries.map((entry) => entry.handle),
      );
    }
    if (entries.length > 0) {
      return Promise.race([
        Promise.allSettled(entries.map((entry) => entry.promise)).then(() =>
          entries.map((entry) => entry.handle),
        ),
        new Promise<BackgroundSpawnHandle[]>((resolve) =>
          setTimeout(() => resolve(entries.map((entry) => entry.handle)), timeoutMs),
        ),
      ]);
    }
    return Promise.resolve([]);
  };
  return {
    track: ({ runId, threadId, spawnId, agentId, agentName, controller, run }) => {
      const handle: BackgroundSpawnHandle = {
        runId,
        threadId,
        spawnId,
        agentId,
        ...(agentName !== undefined ? { agentName } : {}),
        status: 'running',
        lastActivityAt: Date.now(),
      };
      const entry: BackgroundSpawnEntry = {
        handle,
        controller,
        promise: run(controller.signal)
          .then((item) => {
            handle.status = item?.error ? 'failed' : 'done';
            if (item?.output !== undefined) {
              handle.output = item.output;
            }
            if (item?.error !== undefined) {
              handle.error = item.error;
            }
            if (item?.effects !== undefined) {
              handle.effects = item.effects;
            }
            handle.lastActivityAt = Date.now();
            return handle;
          })
          .catch((err) => {
            handle.status = 'failed';
            handle.error = {
              code: 'spawn_error',
              message: err instanceof Error ? err.message : String(err),
            };
            handle.lastActivityAt = Date.now();
            return handle;
          }),
      };
      runMap(runId).set(spawnId, entry);
      return entry.promise;
    },
    isTracked: (runId, spawnId) => byRun.get(runId)?.has(spawnId) ?? false,
    list: (runId) => [...(byRun.get(runId)?.values() ?? [])].map((entry) => entry.handle),
    listByThread: (threadId) =>
      allEntries()
        .filter((entry) => entry.handle.threadId === threadId)
        .map((entry) => entry.handle),
    pendingCount: (runId) => {
      let count = 0;
      for (const entry of byRun.get(runId)?.values() ?? []) {
        if (entry.handle.status === 'running') {
          count += 1;
        }
      }
      return count;
    },
    awaitAll: async (runId, timeoutMs) => {
      const entries = [...(byRun.get(runId)?.values() ?? [])];
      return waitEntries(entries, timeoutMs);
    },
    awaitByThread: async (threadId, timeoutMs) => {
      const entries = allEntries().filter((entry) => entry.handle.threadId === threadId);
      return waitEntries(entries, timeoutMs);
    },
    abortRun: (runId, reason) => {
      for (const entry of byRun.get(runId)?.values() ?? []) {
        if (entry.handle.status === 'running') {
          entry.controller.abort(reason);
        }
      }
    },
    abortSpawn: (spawnId, reason) => {
      let hit = false;
      for (const entry of allEntries()) {
        if (entry.handle.spawnId === spawnId && entry.handle.status === 'running') {
          entry.controller.abort(reason);
          hit = true;
        }
      }
      return hit;
    },
    abortAll: (reason) => {
      for (const entry of allEntries()) {
        if (entry.handle.status === 'running') {
          entry.controller.abort(reason);
        }
      }
    },
  };
}
export function createRunEngine(deps: RunEngineDeps): RunEngine {
  const leaseTtl = deps.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const renewMs = deps.renewMs ?? DEFAULT_LEASE_RENEW_MS;
  const active: Set<RunRuntime> = new Set();
  const byRun = new Map<string, RunRuntime>();
  const childAborts = createChildAbortRegistry();
  const backgroundSpawns = createBackgroundSpawnRegistry();
  const runLogger = deps.logger ?? CONSOLE_LOGGER;
  const hookCache = new Map<string, HookEmitCtx>();
  function envWith(leaseLost: () => boolean, delivery: DeliverySettings): SegmentEnv {
    return {
      lifecycle: deps.lifecycle,
      events: deps.events,
      liveFlushMs: delivery.liveFlushMs,
      journalBatch: delivery.journalBatch,
      isLeaseLost: leaseLost,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      logger: runLogger,
    };
  }
  const idleWaiters: Set<() => void> = new Set();
  function haltRun(run: RunRuntime, runId?: string): void {
    run.abort.abort();
    if (run.renewTimer !== null) {
      clearInterval(run.renewTimer);
      run.renewTimer = null;
    }
    active.delete(run);
    if (runId !== undefined) {
      if (byRun.get(runId) === run) {
        byRun.delete(runId);
      }
    }
    if (active.size === 0) {
      for (const waiter of idleWaiters) {
        waiter();
      }
      idleWaiters.clear();
    }
  }
  function stop(): void {
    for (const run of [...active]) {
      haltRun(run);
    }
    byRun.clear();
    backgroundSpawns.abortAll('engine stopped');
    for (const hooks of hookCache.values()) {
      void hooks.bus.close();
    }
    hookCache.clear();
  }
  async function execute(runId: string, opts: RunTargetOpts): Promise<void> {
    const record = await deps.lifecycle.get(runId);
    if (
      record === null ||
      record.status !== 'running' ||
      record.leaseInstanceId !== deps.instanceId
    ) {
      throw codedRunError('lease_stale', `run ${runId} not owned by ${deps.instanceId}`);
    }
    const epoch = record.leaseEpoch;
    const run: RunRuntime = { abort: new AbortController(), renewTimer: null, leaseLost: false };
    active.add(run);
    byRun.set(runId, run);
    const signal = run.abort.signal;
    const env = envWith(() => run.leaseLost, deps.delivery?.() ?? DEFAULT_DELIVERY_SETTINGS);
    run.renewTimer = setInterval(() => {
      void deps.lifecycle
        .renewLease(runId, deps.instanceId, leaseTtl)
        .then((ok) => {
          if (!ok) {
            run.leaseLost = true;
            runLogger.warn('lease lost', { runId, instanceId: deps.instanceId });
            run.abort.abort(codedRunError('lease_stale', 'lease lost'));
          }
        })
        .catch((err) => {
          runLogger.warn('lease renewal failed', { runId, error: err });
        });
    }, renewMs);
    try {
      const ctx: SegmentCtx = {
        runId,
        epoch,
        pending: [admit(env, runId, runStartedEvent(record.attempt))],
      };
      if (!(await flushJournal(env, ctx))) {
        return;
      }
      const childRuns = new Map<string, ChildRunJournal>();
      const childJournal = (spawnId: string, ev: Event): void => {
        let entry = childRuns.get(spawnId);
        if (entry === undefined) {
          entry = { tail: Promise.resolve(), epoch: 0, closed: false };
          childRuns.set(spawnId, entry);
          const born = entry;
          const childAgent = deps.agents.resolve(ev.agentId, opts.agent);
          entry.tail = deps.lifecycle
            .create({
              runId: spawnId,
              threadId: record.threadId,
              agentId: childAgent?.id ?? ev.agentId ?? record.agentId ?? '',
              agentName: childAgent?.name ?? record.agentName ?? '',
              parentRunId: runId,
            })
            .then((rec) =>
              deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
                from: 'queued',
                to: 'running',
              }),
            )
            .then((rec) => {
              born.epoch = rec.leaseEpoch;
            })
            .catch(() => {});
        }
        const journal = entry;
        const mapped = eventToSessionEvent(ev);
        const terminal = CHILD_TERMINAL_STATUS[ev.type];
        journal.tail = journal.tail
          .then(() => {
            if (mapped === null) {
              return undefined;
            }
            const withRun = { ...mapped, runId: spawnId } as SessionEvent;
            const seq = deps.events.next(spawnId);
            const full = { ...withRun, seq } as SessionEvent;
            return Promise.resolve(deps.events.appendForThread(record.threadId, spawnId, [full]));
          })
          .then(() => {
            if (terminal === undefined || journal.closed) {
              return undefined;
            }
            journal.closed = true;
            return deps.lifecycle
              .transition(spawnId, journal.epoch, { from: 'running', to: terminal })
              .then(() => {});
          })
          .catch(() => {});
      };
      let graphOpts: GraphOpts;
      try {
        graphOpts = await prepareExecuteGraphOpts({
          deps,
          opts,
          runId,
          signal,
          hookCache,
          runLogger,
          childJournal,
          childAborts,
          backgroundSpawns,
          backgroundReport: deps.backgroundReport,
        });
      } catch (err) {
        if (
          env.isLeaseLost() ||
          (
            err as {
              code?: string;
            }
          ).code === 'lease_stale'
        ) {
          return;
        }
        await guardedTransition(env, runId, epoch, {
          from: 'running',
          to: 'failed',
          events: [runFailedEvent(failMessageOf(err))],
        });
        return;
      }
      await runSegment(env, runId, epoch, graphOpts);
      const terminal = await deps.lifecycle
        .get(runId)
        .then((rec) => rec !== null && !RUN_NON_TERMINAL.includes(rec.status))
        .catch(() => false);
      if (terminal) {
        const hooks = opts.hooksEmit ?? hookCache.get(runId);
        if (hooks !== undefined) {
          hookCache.delete(runId);
          await hooks.bus.close();
          await emitHook(hooks, 'SessionEnd', {});
        }
      }
    } finally {
      haltRun(run, runId);
    }
  }
  function abort(runId: string): void {
    const run = byRun.get(runId);
    if (run !== undefined) {
      run.abort.abort(RUN_STOP_CANCEL_REASON);
      backgroundSpawns.abortRun(runId, RUN_STOP_CANCEL_REASON);
      return;
    }
    if (backgroundSpawns.abortSpawn(runId, RUN_STOP_CANCEL_REASON)) {
      return;
    }
    childAborts.abort(runId, RUN_STOP_CANCEL_REASON);
  }
  function isActive(runId: string): boolean {
    return byRun.has(runId);
  }
  function backgroundListByThread(threadId: string): BackgroundSpawnHandle[] {
    return backgroundSpawns.listByThread(threadId);
  }
  function awaitBackgroundByThread(
    threadId: string,
    timeoutMs?: number,
  ): Promise<BackgroundSpawnHandle[]> {
    return backgroundSpawns.awaitByThread(threadId, timeoutMs);
  }
  function whenIdle(): Promise<void> {
    if (active.size === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      idleWaiters.add(resolve);
    });
  }
  return {
    execute,
    isActive,
    abort,
    stop,
    whenIdle,
    close: stop,
    backgroundListByThread,
    awaitBackgroundByThread,
  };
}
