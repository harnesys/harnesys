import { and, eq, gt, isNotNull } from 'drizzle-orm';
import {
  codedRunError,
  type PendingSessionEvent,
  type RunEventStore,
  type SessionEvent,
  type TruncateThreadResult,
} from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable, runsTable } from '../org-sqlite/schema/index.ts';
import { bumpConversationCount, nextThreadSeq } from '../org-sqlite/thread-transcript.store.ts';
import { stampFinalAnswer } from './run-events-final-answer.ts';
import {
  removeThreadEventRow,
  rowToEvent,
  truncateThreadEvents,
} from './sqlite-thread-truncate.ts';

export type RunEventObserver = (
  tx: OrgSqliteDb,
  runId: string,
  threadId: string,
  events: SessionEvent[],
) => void;

export type RunEventPreparer = (
  tx: OrgSqliteDb,
  runId: string,
  threadId: string,
  events: PendingSessionEvent[],
) => PendingSessionEvent[];

export type RunEventAppendListener = (
  threadId: string,
  runId: string,
  events: SessionEvent[],
) => void;

export interface RunEventStoreOptions {
  observe?: RunEventObserver;
  prepare?: RunEventPreparer;
  onAppend?: RunEventAppendListener;
}

function clientEventIdOf(event: PendingSessionEvent): string | undefined {
  return (event as { clientEventId?: string }).clientEventId;
}

function seqOf(event: PendingSessionEvent | SessionEvent): number {
  return (event as { seq?: number }).seq ?? 0;
}

function isConversationalType(type: string): boolean {
  return type === 'user' || type === 'run.completed';
}

export class SqliteRunEventStore implements RunEventStore {
  private readonly seqByRun = new Map<string, number>();

  constructor(
    private readonly db: OrgSqliteDb,
    private readonly options?: RunEventStoreOptions,
  ) {}

  private lastSeqOf(runId: string, tx: OrgSqliteDb): number {
    const known = this.seqByRun.get(runId);
    if (known !== undefined) {
      return known;
    }
    const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    return row?.lastSeq ?? 0;
  }

  private bump(runId: string, seq: number): void {
    const known = this.seqByRun.get(runId) ?? 0;
    if (seq > known) {
      this.seqByRun.set(runId, seq);
    }
  }

  private emitAppended(threadId: string, runId: string, events: SessionEvent[]): void {
    if (events.length === 0) {
      return;
    }
    try {
      this.options?.onAppend?.(threadId, runId, events);
    } catch {
      // events are committed already; realtime fan-out must not fail the append
    }
  }

  next(runId: string): number {
    const seq = this.lastSeqOf(runId, this.db) + 1;
    this.bump(runId, seq);
    return seq;
  }

  appendWithinTx(
    tx: OrgSqliteDb,
    runId: string,
    threadId: string,
    events: PendingSessionEvent[],
  ): SessionEvent[] {
    const now = Date.now();
    const assigned: SessionEvent[] = [];
    const runRow = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    let counter = this.lastSeqOf(runId, tx);
    let persistedMax = runRow?.lastSeq ?? 0;
    const agentId = runRow?.agentId ?? undefined;
    const agentName = runRow?.agentName;
    const prepared = this.options?.prepare
      ? this.options.prepare(tx, runId, threadId, events)
      : events;
    const stamped = stampFinalAnswer(tx, runId, prepared);
    for (const pending of stamped) {
      const result = appendOneEvent(tx, {
        pending,
        runId,
        threadId,
        now,
        counter,
        persistedMax,
        agentId,
        agentName,
      });
      assigned.push(result.event);
      counter = result.counter;
      persistedMax = result.persistedMax;
    }
    if (stamped.length > 0) {
      this.bump(runId, counter);
      tx.update(runsTable)
        .set({ lastSeq: persistedMax, updatedAt: new Date().toISOString() })
        .where(eq(runsTable.runId, runId))
        .run();
    }
    if (assigned.length > 0) {
      this.options?.observe?.(tx, runId, threadId, assigned);
    }
    return assigned;
  }

  append(runId: string, expectedEpoch: number, events: SessionEvent[]): Promise<SessionEvent[]> {
    try {
      let threadId = '';
      const stored = this.db.transaction(
        (tx): SessionEvent[] => {
          const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
          if (row?.status !== 'running' || row?.leaseEpoch !== expectedEpoch) {
            throw codedRunError(
              'lease_stale',
              `run ${runId} not executable by epoch ${expectedEpoch}`,
            );
          }
          threadId = row.threadId;
          return this.appendWithinTx(tx as OrgSqliteDb, runId, row.threadId, events);
        },
        { behavior: 'immediate' },
      );
      this.emitAppended(threadId, runId, stored);
      return Promise.resolve(stored);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  appendForThread(threadId: string, runId: string, events: PendingSessionEvent[]): SessionEvent[] {
    const stored = this.db.transaction(
      (tx): SessionEvent[] => this.appendWithinTx(tx as OrgSqliteDb, runId, threadId, events),
      { behavior: 'immediate' },
    );
    this.emitAppended(threadId, runId, stored);
    return stored;
  }

  tail(runId: string, fromSeq: number): Promise<SessionEvent[]> {
    const rows = this.db
      .select({ event: runEventsTable, agentId: runsTable.agentId, agentName: runsTable.agentName })
      .from(runEventsTable)
      .leftJoin(runsTable, eq(runsTable.runId, runEventsTable.runId))
      .where(and(eq(runEventsTable.runId, runId), gt(runEventsTable.seq, fromSeq)))
      .orderBy(runEventsTable.seq)
      .all();
    return Promise.resolve(
      rows.map((row) => rowToEvent(row.event, { id: row.agentId, name: row.agentName })),
    );
  }

  latestSeq(runId: string): Promise<number> {
    const row = this.db.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    return Promise.resolve(row?.lastSeq ?? 0);
  }

  listByThread(threadId: string): Promise<SessionEvent[]> {
    const rows = this.db
      .select({ event: runEventsTable, agentId: runsTable.agentId, agentName: runsTable.agentName })
      .from(runEventsTable)
      .leftJoin(runsTable, eq(runsTable.runId, runEventsTable.runId))
      .where(eq(runEventsTable.threadId, threadId))
      .orderBy(runEventsTable.threadSeq)
      .all();
    return Promise.resolve(
      rows.map((row) => rowToEvent(row.event, { id: row.agentId, name: row.agentName })),
    );
  }

  hasRun(runId: string): Promise<boolean> {
    const row = this.db
      .select({ threadSeq: runEventsTable.threadSeq })
      .from(runEventsTable)
      .where(and(eq(runEventsTable.runId, runId), isNotNull(runEventsTable.runId)))
      .limit(1)
      .get();
    return Promise.resolve(row !== undefined);
  }

  truncateThreadFrom(threadId: string, threadSeq: number): Promise<TruncateThreadResult> {
    try {
      return Promise.resolve(
        this.db.transaction(
          (tx): TruncateThreadResult => {
            const result = truncateThreadEvents(tx as OrgSqliteDb, threadId, threadSeq);
            for (const id of result.removedRunIds) {
              this.seqByRun.delete(id);
            }
            return result;
          },
          { behavior: 'immediate' },
        ),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }

  removeEvent(threadId: string, threadSeq: number): Promise<SessionEvent | null> {
    try {
      return Promise.resolve(
        this.db.transaction(
          (tx): SessionEvent | null => {
            const result = removeThreadEventRow(tx as OrgSqliteDb, threadId, threadSeq);
            if (result.runDeleted && result.removed?.runId) {
              this.seqByRun.delete(result.removed.runId);
            }
            return result.removed;
          },
          { behavior: 'immediate' },
        ),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

interface AppendOneInput {
  pending: PendingSessionEvent;
  runId: string;
  threadId: string;
  now: number;
  counter: number;
  persistedMax: number;
  agentId?: string;
  agentName?: string;
}

interface AppendOneResult {
  event: SessionEvent;
  counter: number;
  persistedMax: number;
}

function findByClientEventId(
  tx: OrgSqliteDb,
  threadId: string,
  clientEventId: string,
): SessionEvent | null {
  const existing = tx
    .select({ event: runEventsTable, agentId: runsTable.agentId, agentName: runsTable.agentName })
    .from(runEventsTable)
    .leftJoin(runsTable, eq(runsTable.runId, runEventsTable.runId))
    .where(
      and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.clientEventId, clientEventId)),
    )
    .get();
  return existing
    ? rowToEvent(existing.event, { id: existing.agentId, name: existing.agentName })
    : null;
}

function appendOneEvent(tx: OrgSqliteDb, input: AppendOneInput): AppendOneResult {
  const clientEventId = clientEventIdOf(input.pending);
  if (clientEventId !== undefined) {
    const existing = findByClientEventId(tx, input.threadId, clientEventId);
    if (existing) {
      return {
        event: existing,
        counter: input.counter,
        persistedMax: input.persistedMax,
      };
    }
  }
  const pre = seqOf(input.pending);
  const seq = pre > 0 ? pre : input.counter + 1;
  const counter = seq > input.counter ? seq : input.counter;
  const persistedMax = seq > input.persistedMax ? seq : input.persistedMax;
  const threadSeq = nextThreadSeq(tx, input.threadId);
  const conversational = isConversationalType(input.pending.type);
  const agent = {
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.agentName ? { agentName: input.agentName } : {}),
  };
  const full = {
    ...input.pending,
    ...agent,
    seq,
    runId: input.runId,
    threadSeq,
    conversational,
  } as SessionEvent;
  tx.insert(runEventsTable)
    .values({
      threadId: input.threadId,
      threadSeq,
      runId: input.runId,
      seq,
      type: input.pending.type,
      timestamp: input.now,
      metadata: JSON.stringify({ ...input.pending, ...agent }),
      clientEventId: clientEventId ?? null,
      conversational: conversational ? 1 : 0,
    })
    .run();
  if (conversational) {
    bumpConversationCount(tx, input.threadId, 1);
  }
  return { event: full, counter, persistedMax };
}
