import { and, eq, gt } from 'drizzle-orm';
import {
  codedRunError,
  type PendingSessionEvent,
  type RunEventStore,
  type SessionEvent,
  type TruncateThreadResult,
} from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable, runsTable } from '../org-sqlite/schema/index.ts';
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

export interface RunEventStoreOptions {
  observe?: RunEventObserver;
  prepare?: RunEventPreparer;
}

function clientEventIdOf(event: PendingSessionEvent): string | undefined {
  return (event as { clientEventId?: string }).clientEventId;
}

function seqOf(event: PendingSessionEvent | SessionEvent): number {
  return (event as { seq?: number }).seq ?? 0;
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
    let counter = this.lastSeqOf(runId, tx);
    let persistedMax =
      tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get()?.lastSeq ?? 0;
    const prepared = this.options?.prepare
      ? this.options.prepare(tx, runId, threadId, events)
      : events;
    for (const pending of prepared) {
      const result = appendOneEvent(tx, {
        pending,
        runId,
        threadId,
        now,
        counter,
        persistedMax,
      });
      assigned.push(result.event);
      counter = result.counter;
      persistedMax = result.persistedMax;
    }
    if (prepared.length > 0) {
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
      return Promise.resolve(
        this.db.transaction((tx): SessionEvent[] => {
          const row = tx.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
          if (row?.status !== 'running' || row?.leaseEpoch !== expectedEpoch) {
            throw codedRunError(
              'lease_stale',
              `run ${runId} not executable by epoch ${expectedEpoch}`,
            );
          }
          return this.appendWithinTx(tx as OrgSqliteDb, runId, row.threadId, events);
        }),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }

  appendForThread(threadId: string, runId: string, events: PendingSessionEvent[]): SessionEvent[] {
    return this.db.transaction((tx): SessionEvent[] =>
      this.appendWithinTx(tx as OrgSqliteDb, runId, threadId, events),
    );
  }

  tail(runId: string, fromSeq: number): Promise<SessionEvent[]> {
    const rows = this.db
      .select()
      .from(runEventsTable)
      .where(and(eq(runEventsTable.runId, runId), gt(runEventsTable.seq, fromSeq)))
      .all();
    return Promise.resolve(rows.map(rowToEvent));
  }

  latestSeq(runId: string): Promise<number> {
    const row = this.db.select().from(runsTable).where(eq(runsTable.runId, runId)).get();
    return Promise.resolve(row?.lastSeq ?? 0);
  }

  listByThread(threadId: string): Promise<SessionEvent[]> {
    const rows = this.db
      .select()
      .from(runEventsTable)
      .where(eq(runEventsTable.threadId, threadId))
      .all();
    return Promise.resolve(
      rows.sort((a, b) => a.timestamp - b.timestamp || a.seq - b.seq).map(rowToEvent),
    );
  }

  hasRun(runId: string): Promise<boolean> {
    const row = this.db
      .select({ seq: runEventsTable.seq })
      .from(runEventsTable)
      .where(eq(runEventsTable.runId, runId))
      .limit(1)
      .get();
    return Promise.resolve(row !== undefined);
  }

  removeUserEvent(runId: string, seq: number): Promise<boolean> {
    const existing = this.db
      .select({ seq: runEventsTable.seq })
      .from(runEventsTable)
      .where(
        and(
          eq(runEventsTable.runId, runId),
          eq(runEventsTable.seq, seq),
          eq(runEventsTable.type, 'user'),
        ),
      )
      .limit(1)
      .get();
    if (!existing) {
      return Promise.resolve(false);
    }
    this.db
      .delete(runEventsTable)
      .where(and(eq(runEventsTable.runId, runId), eq(runEventsTable.seq, seq)))
      .run();
    return Promise.resolve(true);
  }

  truncateThreadFrom(threadId: string, runId: string, seq: number): Promise<TruncateThreadResult> {
    try {
      return Promise.resolve(
        this.db.transaction((tx): TruncateThreadResult => {
          const result = truncateThreadEvents(tx as OrgSqliteDb, threadId, runId, seq);
          for (const id of result.removedRunIds) {
            this.seqByRun.delete(id);
          }
          return result;
        }),
      );
    } catch (error) {
      return Promise.reject(error);
    }
  }

  removeEvent(threadId: string, runId: string, seq: number): Promise<SessionEvent | null> {
    try {
      return Promise.resolve(
        this.db.transaction((tx): SessionEvent | null => {
          const result = removeThreadEventRow(tx as OrgSqliteDb, threadId, runId, seq);
          if (result.runDeleted) {
            this.seqByRun.delete(runId);
          }
          return result.removed;
        }),
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
    .select()
    .from(runEventsTable)
    .where(
      and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.clientEventId, clientEventId)),
    )
    .get();
  return existing ? rowToEvent(existing) : null;
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
  const full = { ...input.pending, seq, runId: input.runId } as SessionEvent;
  tx.insert(runEventsTable)
    .values({
      runId: input.runId,
      seq,
      threadId: input.threadId,
      type: input.pending.type,
      timestamp: input.now,
      metadata: JSON.stringify({ ...input.pending }),
      clientEventId: clientEventId ?? null,
    })
    .run();
  return { event: full, counter, persistedMax };
}
