import { and, eq } from 'drizzle-orm';
import type { PendingSessionEvent, SessionEvent } from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable, runsTable } from '../org-sqlite/schema/index.ts';
import { bumpConversationCount, nextThreadSeq } from '../org-sqlite/thread-transcript.store.ts';
import { rowToEvent } from './sqlite-thread-truncate.ts';

export interface AppendOneInput {
  pending: PendingSessionEvent;
  runId: string;
  threadId: string;
  now: number;
  counter: number;
  persistedMax: number;
  agentId?: string;
  agentName?: string;
}

export interface AppendOneResult {
  event: SessionEvent;
  counter: number;
  persistedMax: number;
}

export function joinedRows(tx: OrgSqliteDb) {
  return tx
    .select({ event: runEventsTable, agentId: runsTable.agentId, agentName: runsTable.agentName })
    .from(runEventsTable)
    .leftJoin(runsTable, eq(runsTable.runId, runEventsTable.runId));
}

export function rowsToEvents(
  rows: Array<{
    event: typeof runEventsTable.$inferSelect;
    agentId: string | null;
    agentName: string | null;
  }>,
): SessionEvent[] {
  return rows.map((row) => rowToEvent(row.event, { id: row.agentId, name: row.agentName }));
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

function findByClientEventId(
  tx: OrgSqliteDb,
  threadId: string,
  clientEventId: string,
): SessionEvent | null {
  const existing = joinedRows(tx)
    .where(
      and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.clientEventId, clientEventId)),
    )
    .get();
  return existing
    ? rowToEvent(existing.event, { id: existing.agentId, name: existing.agentName })
    : null;
}

export function appendOneEvent(tx: OrgSqliteDb, input: AppendOneInput): AppendOneResult {
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
    ...agent,
    ...input.pending,
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
      metadata: JSON.stringify({ ...agent, ...input.pending }),
      clientEventId: clientEventId ?? null,
      conversational: conversational ? 1 : 0,
    })
    .run();
  if (conversational) {
    bumpConversationCount(tx, input.threadId, 1);
  }
  return { event: full, counter, persistedMax };
}
