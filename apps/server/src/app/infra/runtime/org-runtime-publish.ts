import type { SessionEvent } from 'harnesys';
import type { ThreadEventsPort, ThreadRunEvent } from '../../domain/thread/thread-events.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { observeThreadErrors } from './observe-thread-errors.ts';

export interface OrgEventPublisherDeps {
  orgId: string;
  db: OrgSqliteDb;
  threadEvents?: ThreadEventsPort;
}

export type OrgEventPublisher = (threadId: string, runId: string, events: SessionEvent[]) => void;

export function createOrgEventPublisher(deps: OrgEventPublisherDeps): OrgEventPublisher {
  return (threadId, runId, events) => {
    if (events.length === 0) {
      return;
    }
    deps.threadEvents?.emit(deps.orgId, { type: 'events', threadId, events });
    let threadEvents: ThreadRunEvent[] = [];
    try {
      threadEvents = observeThreadErrors(deps.db, threadId, runId, events);
    } catch {
      // lastError bookkeeping is best-effort and must not break live fan-out
    }
    for (const event of threadEvents) {
      deps.threadEvents?.emit(deps.orgId, event);
    }
  };
}
