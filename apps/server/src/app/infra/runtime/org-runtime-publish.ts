import type { Logger } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import type { ThreadEventsPort, ThreadRunEvent } from '../../domain/thread/thread-events.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { observeThreadErrors } from './observe-thread-errors.ts';

export interface OrgEventPublisherDeps {
  orgId: string;
  db: OrgSqliteDb;
  threadEvents?: ThreadEventsPort;
  logger?: Logger;
}

export type OrgEventPublisher = (threadId: string, runId: string, events: SessionEvent[]) => void;

const DUPLICATE_WINDOW = 2048;

interface FrameIdentity {
  runId: string;
  seq: number;
}

function identityOf(event: SessionEvent): FrameIdentity | undefined {
  const runId = (event as { runId?: unknown }).runId;
  const seq = (event as { seq?: unknown }).seq;
  return typeof runId === 'string' && typeof seq === 'number' ? { runId, seq } : undefined;
}

function markFrame(seen: Set<string>, frame: FrameIdentity): boolean {
  const key = `${frame.runId}:${frame.seq}`;
  if (seen.has(key)) {
    return true;
  }
  seen.add(key);
  if (seen.size > DUPLICATE_WINDOW) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) {
      seen.delete(oldest);
    }
  }
  return false;
}

export function createOrgEventPublisher(deps: OrgEventPublisherDeps): OrgEventPublisher {
  const seen = new Set<string>();
  const warnOnDuplicate = process.env.NODE_ENV !== 'test';
  const noteFrames = (threadId: string, events: SessionEvent[]): void => {
    for (const event of events) {
      const frame = identityOf(event);
      if (frame !== undefined && markFrame(seen, frame) && warnOnDuplicate) {
        deps.logger?.warn(
          { orgId: deps.orgId, threadId, runId: frame.runId, seq: frame.seq },
          'duplicate run event frame',
        );
      }
    }
  };
  return (threadId, runId, events) => {
    if (events.length === 0) {
      return;
    }
    noteFrames(threadId, events);
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
