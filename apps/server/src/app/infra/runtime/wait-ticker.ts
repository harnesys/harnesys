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
}

export interface ThreadSessionRef {
  state: InMemoryRuntimeState;
  handle?: Promise<SessionHandle>;
}

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
  return resumed;
}

async function resumeDueTimer(deps: WaitTickerDeps, rec: RunRecord): Promise<boolean> {
  if (rec.interruptId === undefined) {
    return false;
  }
  try {
    const interrupt = await parkMetaOf(deps.events, rec.runId);
    const waitMode = interrupt.mode === 'sleep' ? 'sleep' : 'gate';
    const onTimeout =
      interrupt.onTimeout === 'continue' || interrupt.onTimeout === 'interrupt'
        ? interrupt.onTimeout
        : 'fail';
    if (waitMode === 'gate' && onTimeout === 'fail') {
      await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
        from: 'waiting',
        to: 'failed',
        interruptId: null,
        waitFireAt: null,
        events: [{ type: 'run.failed', message: 'wait timed out' }],
      });
      deps.kick();
      return true;
    }
    if (waitMode === 'gate' && onTimeout === 'interrupt') {
      await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
        from: 'waiting',
        to: 'needs_input',
        waitFireAt: null,
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
    await deps.lifecycle.transition(rec.runId, rec.leaseEpoch, {
      from: 'waiting',
      to: 'queued',
      interruptId: null,
      waitFireAt: null,
      events: [
        {
          type: 'hitl.answer',
          interruptId: rec.interruptId,
          payload: { timedOut: false },
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
  mode: 'sleep' | 'gate';
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
