import { RUN_NON_TERMINAL, RUN_STOP_CANCEL_REASON } from '../constants.ts';
import { AskUserInterrupt } from '../domain/errors.ts';
import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { Logger } from '../ports/logger.ts';
import type { PendingSessionEvent, RunEventStore } from '../ports/run-event-store.ts';
import type { RunLifecycleStore, RunTransitionPatch } from '../ports/run-lifecycle-store.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SessionEvent } from '../ports/session.ts';
import type { GraphOpts } from './graph.ts';
import { startGraph } from './graph.ts';
import type { MessageSourceKind } from './message-source.ts';
import { finalProviderMessage, isProviderError } from './provider-error.ts';
import {
  eventToSessionEvent,
  runCancelledEvent,
  runCompletedEvent,
  runFailedEvent,
} from './run-engine-events.ts';
export interface SegmentEnv {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  liveFlushMs: number;
  journalBatch: number;
  isLeaseLost: () => boolean;
  sleep: (ms: number) => Promise<void>;
  logger?: Logger;
}
export interface SegmentCtx {
  runId: string;
  epoch: number;
  pending: SessionEvent[];
}
interface SegmentTail {
  doneText?: string;
  failMessage?: string;
  cancelReason?: string;
}
function isToolBoundary(event: SessionEvent): boolean {
  return event.type === 'tool' && event.phase !== 'streaming';
}
function isJournalBoundaryCard(event: SessionEvent): boolean {
  return (
    event.type === 'agent.spawned' ||
    event.type === 'agent.handoff' ||
    event.type === 'map.started' ||
    event.type === 'map.item.started' ||
    event.type === 'map.item.completed' ||
    event.type === 'map.item.failed' ||
    event.type === 'map.completed' ||
    event.type === 'model.retry' ||
    event.type === 'compaction.progress' ||
    event.type === 'wait.started'
  );
}
export function failMessageOf(err: unknown): string {
  if (isProviderError(err)) {
    return finalProviderMessage(err);
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (err && typeof err === 'object') {
    const message = (
      err as {
        message?: unknown;
      }
    ).message;
    if (typeof message === 'string' && message) {
      return message;
    }
  }
  return 'run failed';
}
async function isAlreadyTerminal(env: SegmentEnv, runId: string): Promise<boolean> {
  const rec = await env.lifecycle.get(runId).catch(() => null);
  return rec !== null && !RUN_NON_TERMINAL.includes(rec.status);
}
function lastText(snap: Snapshot | null): string | undefined {
  const state = snap?.state as Record<string, unknown> | undefined;
  const msgs = state?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return undefined;
  }
  const last = msgs[msgs.length - 1] as Record<string, unknown> | undefined;
  const content = last?.content;
  return typeof content === 'string' && content ? content : undefined;
}
export function admit(env: SegmentEnv, runId: string, event: PendingSessionEvent): SessionEvent {
  const seq = env.events.next(runId);
  return { ...event, seq, runId } as SessionEvent;
}

type BoundaryKind = 'assistant' | 'user' | 'tool' | 'other';

interface BoundaryLedgerEntry {
  admittedSeq: number;
  kind: BoundaryKind;
  toolCallId?: string;
}

type BoundaryLedger = Map<number, BoundaryLedgerEntry>;

function boundaryKindOf(event: SessionEvent): BoundaryKind {
  if (event.type === 'model.usage' || event.type === 'compaction') {
    return 'assistant';
  }
  if (event.type === 'user') {
    return 'user';
  }
  if (
    event.type === 'tool' &&
    (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'skipped')
  ) {
    return 'tool';
  }
  return 'other';
}

function boundaryEntryOf(event: SessionEvent): BoundaryLedgerEntry {
  return {
    admittedSeq: event.seq ?? 0,
    kind: boundaryKindOf(event),
    ...(event.type === 'tool' && event.toolCallId ? { toolCallId: event.toolCallId } : {}),
  };
}

export function restoreBoundaryLedger(events: SessionEvent[]): BoundaryLedger {
  const ledger: BoundaryLedger = new Map();
  for (const event of events) {
    if (typeof event.engSeq !== 'number' || typeof event.seq !== 'number') {
      continue;
    }
    ledger.set(event.engSeq, boundaryEntryOf(event));
  }
  return ledger;
}

function boundaryKindMatches(
  kind: MessageSourceKind | undefined,
  entry: BoundaryLedgerEntry,
): boolean {
  if (kind === undefined) {
    return false;
  }
  if (kind === 'tool') {
    return entry.kind === 'tool';
  }
  return entry.kind === kind;
}

export function resolveAnchorCursor(
  anchor: Extract<SessionEvent, { type: 'compaction' }>,
  ledger: BoundaryLedger,
  runId: string,
): void {
  if (anchor.durable === false) {
    return;
  }
  if (typeof anchor.coveredUntilRunId === 'string' && typeof anchor.coveredUntilSeq === 'number') {
    return;
  }
  const entry =
    typeof anchor.coveredUntilEngSeq === 'number'
      ? ledger.get(anchor.coveredUntilEngSeq)
      : undefined;
  if (!entry || entry.kind === 'other') {
    anchor.durable = false;
    anchor.unresolvedReason = 'boundary-not-in-ledger';
    return;
  }
  if (
    !boundaryKindMatches(anchor.coveredKind, entry) ||
    (anchor.coveredKind === 'tool' && entry.toolCallId !== anchor.coveredToolCallId)
  ) {
    anchor.durable = false;
    anchor.unresolvedReason = 'boundary-type-mismatch';
    return;
  }
  anchor.coveredUntilRunId = runId;
  anchor.coveredUntilSeq = entry.admittedSeq;
}

function engineSeqOf(event: Event): number | undefined {
  const value = (event.metadata as Record<string, unknown> | undefined)?.engSeq;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function withEngSeq(event: SessionEvent, engSeq: number | undefined): SessionEvent {
  return engSeq === undefined ? event : ({ ...event, engSeq } as SessionEvent);
}
export async function flushJournal(env: SegmentEnv, ctx: SegmentCtx): Promise<boolean> {
  if (ctx.pending.length === 0) {
    return true;
  }
  try {
    await env.events.append(ctx.runId, ctx.epoch, ctx.pending);
    ctx.pending.length = 0;
    return true;
  } catch (err) {
    if (
      (
        err as {
          code?: string;
        }
      ).code === 'lease_stale'
    ) {
      ctx.pending.length = 0;
      return false;
    }
    throw err;
  }
}
export async function guardedTransition(
  env: SegmentEnv,
  runId: string,
  expectedEpoch: number,
  patch: RunTransitionPatch,
): Promise<void> {
  try {
    await withBusyRetries(env, runId, expectedEpoch, patch);
  } catch (err) {
    if (
      (
        err as {
          code?: string;
        }
      ).code === 'lease_stale'
    ) {
      return;
    }
    throw err;
  }
}

const BUSY_RETRY_DELAYS_MS = [500, 1_000, 2_000];
function isBusyError(err: unknown): boolean {
  if (err instanceof Error && err.message.includes('database is locked')) {
    return true;
  }
  return false;
}
async function withBusyRetries(
  env: SegmentEnv,
  runId: string,
  expectedEpoch: number,
  patch: RunTransitionPatch,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await env.lifecycle.transition(runId, expectedEpoch, patch);
      return;
    } catch (err) {
      if (attempt >= BUSY_RETRY_DELAYS_MS.length || !isBusyError(err)) {
        throw err;
      }
      await env.sleep(BUSY_RETRY_DELAYS_MS[attempt] ?? 1_000);
    }
  }
}
async function pauseOnAsk(
  env: SegmentEnv,
  ctx: SegmentCtx,
  ask: PendingSessionEvent,
  askId: string,
): Promise<void> {
  if (!(await flushJournal(env, ctx))) {
    return;
  }
  if (env.isLeaseLost()) {
    return;
  }
  await guardedTransition(env, ctx.runId, ctx.epoch, {
    from: 'running',
    to: 'needs_input',
    interruptId: askId,
    events: [ask],
  });
}
async function pauseFromSnapshot(
  env: SegmentEnv,
  ctx: SegmentCtx,
  snap: Snapshot | null,
): Promise<void> {
  const interrupt = snap?.cursor.interrupt;
  if (interrupt === undefined) {
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'failed',
      events: [runFailedEvent('segment paused without interrupt cursor')],
    });
    return;
  }
  const ask = {
    type: 'ask',
    askId: interrupt.interruptId,
    schema: interrupt.resumeSchema,
    source: 'interrupt',
    prompt: interrupt.reason,
  } as PendingSessionEvent;
  await pauseOnAsk(env, ctx, ask, interrupt.interruptId);
}
async function pauseOnWaiting(
  env: SegmentEnv,
  ctx: SegmentCtx,
  snap: Snapshot | null,
): Promise<void> {
  if (!(await flushJournal(env, ctx))) {
    return;
  }
  if (env.isLeaseLost()) {
    return;
  }
  const interrupt = snap?.cursor.interrupt;
  if (interrupt === undefined) {
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'failed',
      events: [runFailedEvent('waiting without interrupt cursor')],
    });
    return;
  }
  const fireAt = snap?.cursor.timers?.[0]?.fireAt;
  await guardedTransition(env, ctx.runId, ctx.epoch, {
    from: 'running',
    to: 'waiting',
    interruptId: interrupt.interruptId,
    waitFireAt: typeof fireAt === 'number' ? fireAt : null,
    wakeKey: typeof interrupt.wakeKey === 'string' ? interrupt.wakeKey : null,
  });
}
async function pauseOnInterrupt(
  env: SegmentEnv,
  ctx: SegmentCtx,
  err: AskUserInterrupt,
  state: RuntimeState,
): Promise<void> {
  const snap = await state.load();
  const interruptId = err.interruptId ?? snap?.cursor.interrupt?.interruptId ?? crypto.randomUUID();
  const ask = {
    type: 'ask',
    askId: interruptId,
    schema: err.resumeSchema ?? {},
    source: err.source ?? 'ask_user',
    prompt: err.prompt,
    tool: err.tool,
  } as PendingSessionEvent;
  await pauseOnAsk(env, ctx, ask, interruptId);
}
async function settleTerminal(
  env: SegmentEnv,
  ctx: SegmentCtx,
  tail: SegmentTail,
  snap: Snapshot | null,
): Promise<void> {
  if (!(await flushJournal(env, ctx))) {
    return;
  }
  if (env.isLeaseLost()) {
    return;
  }
  const status = snap?.status ?? 'completed';
  if (status === 'needs_input') {
    await pauseFromSnapshot(env, ctx, snap);
    return;
  }
  if (status === 'waiting') {
    await pauseOnWaiting(env, ctx, snap);
    return;
  }
  if (status === 'timed_out') {
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'failed',
      events: [runFailedEvent(tail.failMessage ?? 'run timed out')],
    });
    return;
  }
  if (status === 'completed') {
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'completed',
      events: [runCompletedEvent(tail.doneText ?? lastText(snap))],
    });
    return;
  }
  if (status === 'cancelled' || tail.cancelReason !== undefined) {
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'cancelled',
      events: [runCancelledEvent(tail.cancelReason ?? RUN_STOP_CANCEL_REASON)],
    });
    return;
  }
  await guardedTransition(env, ctx.runId, ctx.epoch, {
    from: 'running',
    to: 'failed',
    events: [runFailedEvent(tail.failMessage ?? `run failed: ${status}`)],
  });
}
async function failSegment(
  env: SegmentEnv,
  ctx: SegmentCtx,
  graphOpts: GraphOpts,
  err: unknown,
): Promise<void> {
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
  if (err instanceof AskUserInterrupt) {
    await pauseOnInterrupt(env, ctx, err, graphOpts.state);
    return;
  }
  if (!(await flushJournal(env, ctx))) {
    return;
  }
  if (env.isLeaseLost()) {
    return;
  }
  if (graphOpts.signal?.aborted) {
    const reason = graphOpts.signal.reason;
    if (await isAlreadyTerminal(env, ctx.runId)) {
      return;
    }
    await guardedTransition(env, ctx.runId, ctx.epoch, {
      from: 'running',
      to: 'cancelled',
      events: [
        runCancelledEvent(typeof reason === 'string' && reason ? reason : RUN_STOP_CANCEL_REASON),
      ],
    });
    return;
  }
  await guardedTransition(env, ctx.runId, ctx.epoch, {
    from: 'running',
    to: 'failed',
    events: [runFailedEvent(failMessageOf(err))],
  });
}
export async function runSegment(
  env: SegmentEnv,
  runId: string,
  epoch: number,
  graphOpts: GraphOpts,
): Promise<void> {
  const ctx: SegmentCtx = { runId, epoch, pending: [] };
  const tail: SegmentTail = {};
  const ledger = restoreBoundaryLedger(await env.events.listByRun(runId));
  let lastFlushAt = Date.now();
  let ask: {
    event: PendingSessionEvent;
    askId: string;
  } | null = null;
  try {
    for await (const event of startGraph(graphOpts)) {
      const mapped = eventToSessionEvent(event);
      if (mapped === null) {
        continue;
      }
      if (mapped.type === 'ask') {
        ask = { event: mapped, askId: mapped.askId };
        break;
      }
      if (mapped.type === 'done') {
        tail.doneText = mapped.text;
        continue;
      }
      if (mapped.type === 'error') {
        if (mapped.code === 'cancelled') {
          tail.cancelReason = mapped.message;
        } else {
          tail.failMessage = mapped.message;
        }
        continue;
      }
      const engSeq = engineSeqOf(event);
      const prepared = withEngSeq(mapped, engSeq);
      if (prepared.type === 'compaction') {
        // The append hook resolves this anchor's thread cursor from the
        // already-persisted stream, so everything before it must be committed.
        if (!(await flushJournal(env, ctx))) {
          return;
        }
        resolveAnchorCursor(prepared, ledger, runId);
      }
      const admitted = admit(env, runId, prepared);
      if (engSeq !== undefined) {
        ledger.set(engSeq, boundaryEntryOf(admitted));
      }
      ctx.pending.push(admitted);
      if (
        ctx.pending.length >= env.journalBatch ||
        isToolBoundary(mapped) ||
        isJournalBoundaryCard(mapped) ||
        Date.now() - lastFlushAt >= env.liveFlushMs
      ) {
        if (!(await flushJournal(env, ctx))) {
          return;
        }
        lastFlushAt = Date.now();
      }
    }
  } catch (err) {
    await failSegment(env, ctx, graphOpts, err);
    return;
  }
  if (ask !== null) {
    await pauseOnAsk(env, ctx, ask.event, ask.askId);
    return;
  }
  try {
    await settleTerminal(env, ctx, tail, await graphOpts.state.load());
  } catch (err) {
    env.logger?.error(`run terminal transition failed for run ${runId}: ${failMessageOf(err)}`);
    await guardedTransition(env, runId, epoch, {
      from: 'running',
      to: 'failed',
      events: [runFailedEvent(`failed to persist run completion: ${failMessageOf(err)}`)],
    }).catch(() => {
      // последняя попытка не удалась — статус остаётся, запись в журнал невозможна
    });
  }
}
