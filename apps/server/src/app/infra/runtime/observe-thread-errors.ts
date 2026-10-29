import { eq } from 'drizzle-orm';
import type { SessionEvent } from 'harnesys';
import type { ThreadRunEvent } from '../../domain/thread/thread-events.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { threadsTable } from '../org-sqlite/schema/index.ts';

export interface ObserveThreadErrorsDeps {
  orgId: string;
  onEvent: (event: ThreadRunEvent) => void;
}

interface ThreadMetadataRow {
  metadata: string;
}

export function observeThreadErrors(
  tx: OrgSqliteDb,
  deps: ObserveThreadErrorsDeps,
  threadId: string,
  runId: string,
  events: SessionEvent[],
): void {
  for (const event of events) {
    const observed = observeThreadEvent(tx, deps, threadId, runId, event);
    if (observed) {
      return;
    }
  }
}

function observeThreadEvent(
  tx: OrgSqliteDb,
  deps: ObserveThreadErrorsDeps,
  threadId: string,
  runId: string,
  event: SessionEvent,
): boolean {
  if (event.type === 'run.failed') {
    const message = readMessage(event);
    const at = new Date().toISOString();
    writeLastError(tx, threadId, { runId, message, at });
    deps.onEvent({ type: 'failed', threadId, runId, message, at });
    return true;
  }
  if (event.type === 'run.completed' || event.type === 'run.cancelled' || event.type === 'done') {
    deps.onEvent({ type: 'finished', threadId, runId, status: terminalStatusOf(event.type) });
    return true;
  }
  if (event.type === 'ask') {
    const source = (event as { source?: unknown }).source;
    deps.onEvent({
      type: 'parked',
      threadId,
      runId,
      source: typeof source === 'string' ? source : 'interrupt',
    });
    return true;
  }
  if (event.type === 'run.started') {
    clearLastError(tx, threadId);
    deps.onEvent({ type: 'cleared', threadId, runId });
    return true;
  }
  return false;
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
