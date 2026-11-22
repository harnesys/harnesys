import type {
  JsonSchema,
  RunEventStore,
  RunLifecycleStore,
  RunRecord,
  RunTransitionPatch,
  SessionHandle,
} from 'harnesys';
import { InMemoryRuntimeState } from 'harnesys';
import { WAIT_TICK_BATCH, WAIT_TICK_SCAN } from '../../domain/thread/run-wait-timer.ts';

export interface WaitTickerDeps {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  kick: () => void;
  isAwaitSettled?: (wakeKey: string) => boolean | Promise<boolean>;
}

export interface ThreadSessionRef {
  state: InMemoryRuntimeState;
  handle?: Promise<SessionHandle>;
}

type ResumeCause = 'timer' | 'respond' | 'signal';

export function withWaitGateSignal(
  lifecycle: RunLifecycleStore,
  onWaitScheduled: () => void,
): RunLifecycleStore {
  const rawTransition = lifecycle.transition.bind(lifecycle);
  return Object.assign(Object.create(lifecycle) as RunLifecycleStore, {
    async transition(runId: string, expectedEpoch: number, patch: RunTransitionPatch) {
      const record = await rawTransition(runId, expectedEpoch, patch);
      if (patch.to === 'waiting' && record.waitFireAt !== undefined) {
        onWaitScheduled();
      }
      return record;
    },
  });
}

export async function sweepWaitTimers(deps: WaitTickerDeps): Promise<number> {
  const due = await deps.lifecycle.listDueTimers({ limit: WAIT_TICK_BATCH, now: Date.now() });
  let resumed = 0;
  for (const rec of due) {
    if (await resumeDueTimer(deps, rec)) {
      resumed += 1;
    }
  }
  resumed += await sweepSettledAwaits(deps);
  return resumed;
}

export async function wakeAwaitRuns(
  deps: WaitTickerDeps,
  wakeKey: string,
  agentId?: string,
): Promise<number> {
  const waiting = await deps.lifecycle.listWaitingAwait({ limit: WAIT_TICK_BATCH });
  let resumed = 0;
  for (const rec of waiting) {
    if (rec.wakeKey !== wakeKey) {
      continue;
    }
    if (agentId !== undefined && rec.agentId !== agentId) {
      continue;
    }
    if (await resumeParkedRun(deps, rec, { timedOut: false, cause: 'signal' })) {
      resumed += 1;
    }
  }
  return resumed;
}

export interface OrgWaitTickerOptions {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  kick: () => void;
  isAwaitSettled: (wakeKey: string) => boolean | Promise<boolean>;
  countWaitingTimers: () => number;
  releaseGate: () => void;
}

export interface OrgWaitTicker {
  tick(): Promise<number>;
  wake(wakeKey: string, agentId?: string): Promise<number>;
}

export function createWaitTicker(options: OrgWaitTickerOptions): OrgWaitTicker {
  const deps: WaitTickerDeps = {
    lifecycle: options.lifecycle,
    events: options.events,
    kick: options.kick,
    isAwaitSettled: options.isAwaitSettled,
  };
  return {
    async tick(): Promise<number> {
      const resumed = await sweepWaitTimers(deps);
      if (options.countWaitingTimers() === 0) {
        options.releaseGate();
      }
      return resumed;
    },
    wake: (wakeKey, agentId) => wakeAwaitRuns(deps, wakeKey, agentId),
  };
}

async function sweepSettledAwaits(deps: WaitTickerDeps): Promise<number> {
  if (deps.isAwaitSettled === undefined) {
    return 0;
  }
  const waiting = await deps.lifecycle.listWaitingAwait({ limit: WAIT_TICK_BATCH });
  let resumed = 0;
  for (const rec of waiting) {
    if (rec.wakeKey === undefined) {
      continue;
    }
    if (!(await deps.isAwaitSettled(rec.wakeKey))) {
      continue;
    }
    if (await resumeParkedRun(deps, rec, { timedOut: false, cause: 'signal' })) {
      resumed += 1;
    }
  }
  return resumed;
}

async function resumeDueTimer(deps: WaitTickerDeps, rec: RunRecord): Promise<boolean> {
  if (rec.interruptId === undefined) {
    return false;
  }
  try {
    const interrupt = await parkMetaOf(deps.events, rec.runId);
    const onTimeout =
      interrupt.onTimeout === 'continue' || interrupt.onTimeout === 'interrupt'
        ? interrupt.onTimeout
        : 'fail';
    const gated = interrupt.mode === 'gate' || interrupt.mode === 'await';
    if (gated && onTimeout === 'fail') {
      await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
        from: 'waiting',
        to: 'failed',
        interruptId: null,
        waitFireAt: null,
        wakeKey: null,
        events: [{ type: 'run.failed', message: 'wait timed out' }],
      });
      deps.kick();
      return true;
    }
    if (gated && onTimeout === 'interrupt') {
      await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
        from: 'waiting',
        to: 'needs_input',
        waitFireAt: null,
        wakeKey: null,
        events: [
          {
            type: 'ask',
            askId: rec.interruptId,
            schema: interrupt.resumeSchema,
            source: 'interrupt',
            prompt: interrupt.reason,
          },
        ],
      });
      deps.kick();
      return true;
    }
    const timedOut = interrupt.mode === 'await';
    return await resumeParkedRun(deps, rec, { timedOut, cause: 'timer' });
  } catch {
    return false;
  }
}

async function resumeParkedRun(
  deps: WaitTickerDeps,
  rec: RunRecord,
  opts: { timedOut: boolean; cause: ResumeCause },
): Promise<boolean> {
  if (rec.interruptId === undefined) {
    return false;
  }
  try {
    await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
      from: 'waiting',
      to: 'queued',
      interruptId: null,
      waitFireAt: null,
      wakeKey: null,
      events: [
        {
          type: 'hitl.answer',
          interruptId: rec.interruptId,
          payload: { timedOut: opts.timedOut, cause: opts.cause },
        },
      ],
    });
    deps.kick();
    return true;
  } catch {
    return false;
  }
}

interface ParkMeta {
  mode: 'sleep' | 'gate' | 'await';
  onTimeout?: string;
  resumeSchema: JsonSchema;
  reason?: string;
}

async function parkMetaOf(events: RunEventStore, runId: string): Promise<ParkMeta> {
  const latestSeq = await events.latestSeq(runId);
  const tail = await events.tail(runId, Math.max(0, latestSeq - WAIT_TICK_SCAN));
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const ev = tail[i];
    if (ev === undefined || ev.type !== 'wait.started') {
      continue;
    }
    return {
      mode: ev.mode,
      ...(ev.onTimeout ? { onTimeout: ev.onTimeout } : {}),
      resumeSchema: ev.schema ?? { type: 'object' },
      ...(ev.prompt ? { reason: ev.prompt } : {}),
    };
  }
  return { mode: 'gate', resumeSchema: { type: 'object' } };
}
