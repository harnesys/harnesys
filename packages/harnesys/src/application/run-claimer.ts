import {
  DEFAULT_CLAIMABLE_LIMIT,
  DEFAULT_CLAIMER_SWEEP_MS,
  DEFAULT_LEASE_TTL_MS,
} from '../constants.ts';
import type { RunLifecycleStore, RunRecord } from '../ports/run-lifecycle-store.ts';
import type { RunTarget, RunTargets } from '../ports/run-targets.ts';
import { runFailedEvent } from './run-engine-events.ts';
import type { RunEngine } from './run-engine-types.ts';
export interface RunClaimer {
  kick(): void;

  halt(): void;
  stop(): void;
}
export function createRunClaimer(deps: {
  lifecycle: RunLifecycleStore;
  targets: RunTargets;
  engine: RunEngine;
  instanceId: string;
  leaseTtlMs?: number;
  sweepMs?: number;
  withScope?: (target: RunTarget, execute: () => Promise<void>) => Promise<void>;
  onComplete?: (record: RunRecord) => void;
  shouldReap?: (record: RunRecord) => boolean | Promise<boolean>;
  onSweep?: () => void | Promise<void>;
}): RunClaimer {
  const leaseTtl = deps.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const sweepMs = deps.sweepMs ?? DEFAULT_CLAIMER_SWEEP_MS;
  let stopped = false;
  let sweeping = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const executing = new Set<string>();
  function finishWith(record: RunRecord): void {
    if (deps.onComplete !== undefined) {
      deps.onComplete(record);
    }
  }
  async function failUnavailable(rec: RunRecord): Promise<RunRecord | null> {
    try {
      return await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
        from: 'queued',
        to: 'failed',
        events: [runFailedEvent('run target unavailable')],
      });
    } catch (err) {
      const code = (
        err as {
          code?: string;
        }
      ).code;
      if (code === 'already_resumed' || code === 'lease_stale') {
        return null;
      }
      throw err;
    }
  }
  async function resolveTarget(rec: RunRecord): Promise<RunTarget | null> {
    try {
      return await deps.targets.resolve(rec.threadId, rec.runId);
    } catch {
      return null;
    }
  }
  async function tryClaim(runId: string): Promise<void> {
    if (executing.has(runId)) {
      return;
    }
    const rec = await deps.lifecycle.get(runId);
    if (rec === null || rec.status !== 'queued') {
      return;
    }
    const target = await resolveTarget(rec);
    if (target === null) {
      const failed = await failUnavailable(rec);
      if (failed !== null) {
        finishWith(failed);
      }
      return;
    }
    const claimed = await deps.lifecycle.claim(runId, deps.instanceId, leaseTtl);
    if (claimed === null) {
      return;
    }
    executing.add(runId);
    const run = (): Promise<void> => deps.engine.execute(runId, target);
    const execution = deps.withScope !== undefined ? deps.withScope(target, run) : run();
    void execution
      .catch(() => {})
      .finally(() => {
        executing.delete(runId);
        void Promise.resolve()
          .then(() => deps.lifecycle.get(runId))
          .then((record) => {
            if (record !== null) {
              finishWith(record);
            }
          })
          .catch(() => {});
        void sweep().catch(() => undefined);
      });
  }
  async function sweep(): Promise<void> {
    if (stopped || sweeping) {
      return;
    }
    sweeping = true;
    try {
      await deps.onSweep?.();
      await reapStaleRunning();
      const claimable = await deps.lifecycle.listClaimable({ limit: DEFAULT_CLAIMABLE_LIMIT });
      for (const rec of claimable) {
        if (stopped) {
          return;
        }
        await tryClaim(rec.runId);
      }
    } finally {
      sweeping = false;
    }
  }
  async function reapStaleRunning(): Promise<void> {
    const stale = await deps.lifecycle.listStaleRunning({ limit: DEFAULT_CLAIMABLE_LIMIT });
    for (const rec of stale) {
      if (stopped) {
        return;
      }
      if ((await Promise.resolve(deps.shouldReap?.(rec))) === false) {
        continue;
      }
      try {
        const failed = await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
          from: 'running',
          to: 'failed',
          events: [runFailedEvent('orphaned run: lease expired without completion')],
        });
        finishWith(failed);
      } catch {
        // lost the race with a live executor re-claiming the run — leave it alone
      }
    }
  }
  timer = setInterval(() => {
    void sweep().catch(() => undefined);
  }, sweepMs);
  return {
    kick() {
      void sweep().catch(() => undefined);
    },
    halt() {
      stopped = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    stop() {
      this.halt();
      deps.engine.stop();
    },
  };
}
