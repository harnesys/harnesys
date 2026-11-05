import { eq } from 'drizzle-orm';
import type { SessionEvent } from 'harnesys';
import type { ThreadRunEvent } from '../../domain/thread/thread-events.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { threadsTable } from '../org-sqlite/schema/index.ts';

export function observeThreadErrors(
  tx: OrgSqliteDb,
  threadId: string,
  runId: string,
  events: SessionEvent[],
): ThreadRunEvent[] {
  const observed: ThreadRunEvent[] = [];
  for (const event of events) {
    const threadEvent = observeThreadEvent(tx, threadId, runId, event);
    if (threadEvent !== null) {
      observed.push(threadEvent);
    }
  }
  return observed;
}

function observeThreadEvent(
  tx: OrgSqliteDb,
  threadId: string,
  runId: string,
  event: SessionEvent,
): ThreadRunEvent | null {
  if (event.type === 'run.failed') {
    const message = readMessage(event);
    const at = new Date().toISOString();
    writeLastError(tx, threadId, { runId, message, at });
    return { type: 'failed', threadId, runId, message, at };
  }
  if (event.type === 'run.completed' || event.type === 'run.cancelled' || event.type === 'done') {
    return { type: 'finished', threadId, runId, status: terminalStatusOf(event.type) };
  }
  if (event.type === 'ask') {
    const source = (event as { source?: unknown }).source;
    return {
      type: 'parked',
      threadId,
      runId,
      source: typeof source === 'string' ? source : 'interrupt',
    };
  }
  if (event.type === 'run.started') {
    clearLastError(tx, threadId);
    return { type: 'cleared', threadId, runId };
  }
  return null;
}

function terminalStatusOf(
  type: 'run.completed' | 'run.cancelled' | 'done',
): 'completed' | 'cancelled' {
  return type === 'run.cancelled' ? 'cancelled' : 'completed';
}

function readMessage(event: SessionEvent): string {
  const message = (event as { message?: unknown }).message;
  return typeof message === 'string' && message ? message : 'run failed';
}

function writeLastError(
  tx: OrgSqliteDb,
  threadId: string,
  lastError: { runId: string; message: string; at: string },
): void {
  const row = tx
    .select({ metadata: threadsTable.metadata })
    .from(threadsTable)
    .where(eq(threadsTable.id, threadId))
    .get() as ThreadMetadataRow | undefined;
  if (!row) {
    return;
  }
  const metadata = parseMetadata(row.metadata);
  metadata.lastError = lastError;
  tx.update(threadsTable)
    .set({ metadata: JSON.stringify(metadata) })
    .where(eq(threadsTable.id, threadId))
    .run();
}

function clearLastError(tx: OrgSqliteDb, threadId: string): void {
  const row = tx
    .select({ metadata: threadsTable.metadata })
    .from(threadsTable)
    .where(eq(threadsTable.id, threadId))
    .get() as ThreadMetadataRow | undefined;
  if (!row) {
    return;
  }
  const metadata = parseMetadata(row.metadata);
  if (metadata.lastError === undefined) {
    return;
  }
  delete metadata.lastError;
  tx.update(threadsTable)
    .set({ metadata: JSON.stringify(metadata) })
    .where(eq(threadsTable.id, threadId))
    .run();
}

interface ThreadMetadataRow {
  metadata: string;
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
