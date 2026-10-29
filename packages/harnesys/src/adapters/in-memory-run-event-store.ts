import { codedRunError } from '../domain/errors.ts';
import type {
  PendingSessionEvent,
  RunEventStore,
  TruncateThreadResult,
} from '../ports/run-event-store.ts';
import type { RunRecord } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';

function seqOf(event: SessionEvent): number {
  return (
    (
      event as {
        seq?: number;
      }
    ).seq ?? 0
  );
}

export class InMemoryRunEventStore implements RunEventStore {
  events: Map<string, SessionEvent[]> = new Map();
  nextSeq: Map<string, number> = new Map();
  private insertion: InsertionEntry[] = [];
  private runs: Map<string, RunRecord> | null = null;
  attachLifecycleRuns(runs: Map<string, RunRecord>): void {
    this.runs = runs;
  }
  append(runId: string, expectedEpoch: number, events: SessionEvent[]): Promise<SessionEvent[]> {
    const record = this.runs?.get(runId);
    if (record?.status !== 'running' || record.leaseEpoch !== expectedEpoch) {
      return Promise.reject(
        codedRunError('lease_stale', `run ${runId} is not leased for epoch ${expectedEpoch}`),
      );
    }
    return Promise.resolve(this.appendLocked(runId, events));
  }
  appendForThread(
    threadId: string,
    runId: string,
    events: PendingSessionEvent[],
  ): Promise<SessionEvent[]> {
    void threadId;
    return Promise.resolve(this.appendLocked(runId, events));
  }
  next(runId: string): number {
    const seq = (this.nextSeq.get(runId) ?? 0) + 1;
    this.nextSeq.set(runId, seq);
    return seq;
  }
  appendLocked(runId: string, events: PendingSessionEvent[]): SessionEvent[] {
    const stored = this.events.get(runId) ?? [];
    const record = this.runs?.get(runId);
    let maxSeq = this.nextSeq.get(runId) ?? 0;
    const assigned: SessionEvent[] = [];
    for (const event of events) {
      const pre = seqOf(event as SessionEvent);
      const seq = pre > 0 ? pre : maxSeq + 1;
      if (seq > maxSeq) {
        maxSeq = seq;
      }
      const full = { ...event, seq, runId } as SessionEvent;
      stored.push(full);
      this.insertion.push({ threadId: record?.threadId ?? '', event: full });
      assigned.push(full);
    }
    this.events.set(runId, stored);
    this.nextSeq.set(runId, maxSeq);
    if (record) {
      record.lastSeq = maxSeq;
    }
    return assigned.map((event) => ({ ...event }));
  }
  tail(runId: string, fromSeq: number): Promise<SessionEvent[]> {
    return Promise.resolve(
      (this.events.get(runId) ?? []).filter((event) => seqOf(event) > fromSeq),
    );
  }
  latestSeq(runId: string): Promise<number> {
    return Promise.resolve(this.nextSeq.get(runId) ?? 0);
  }
  listByThread(threadId: string): Promise<SessionEvent[]> {
    return Promise.resolve(
      this.insertion.filter((e) => e.threadId === threadId).map((e) => e.event),
    );
  }
  hasRun(runId: string): Promise<boolean> {
    const stored = this.events.get(runId);
    return Promise.resolve(stored !== undefined && stored.length > 0);
  }
  removeUserEvent(runId: string, seq: number): Promise<boolean> {
    const stored = this.events.get(runId);
    if (!stored) {
      return Promise.resolve(false);
    }
    const index = stored.findIndex((event) => seqOf(event) === seq && event.type === 'user');
    if (index < 0) {
      return Promise.resolve(false);
    }
    stored.splice(index, 1);
    const insertionIndex = this.insertion.findIndex(
      (entry) => entry.event.runId === runId && seqOf(entry.event) === seq,
    );
    if (insertionIndex >= 0) {
      this.insertion.splice(insertionIndex, 1);
    }
    return Promise.resolve(true);
  }
  truncateThreadFrom(threadId: string, runId: string, seq: number): Promise<TruncateThreadResult> {
    const cutoffIndex = this.insertion.findIndex(
      (entry) =>
        entry.threadId === threadId && entry.event.runId === runId && seqOf(entry.event) === seq,
    );
    const found = cutoffIndex < 0 ? undefined : this.insertion[cutoffIndex];
    if (!found) {
      return Promise.reject(codedRunError('unknown_event', `event ${runId}:${seq} not found`));
    }
    const cutoff = { ...found.event } as SessionEvent;
    const removedKeys = tailKeys(this.insertion, cutoffIndex, threadId);
    this.insertion = this.insertion.filter(
      (entry) => entry.threadId !== threadId || !removedKeys.has(eventKey(entry)),
    );
    dropEventsByKeys(this.events, this.nextSeq, removedKeys);
    const removedRunIds = this.dropEmptiedThreadRuns(threadId);
    return Promise.resolve({
      cutoff,
      removedEvents: removedKeys.size,
      removedRunIds,
      remainingUserCount: countThreadUsers(this.insertion, threadId),
    });
  }
  removeEvent(threadId: string, runId: string, seq: number): Promise<SessionEvent | null> {
    const stored = this.events.get(runId);
    if (!stored) {
      return Promise.resolve(null);
    }
    const index = stored.findIndex((event) => seqOf(event) === seq);
    if (index < 0) {
      return Promise.resolve(null);
    }
    const [deleted] = stored.splice(index, 1);
    const insertionIndex = this.insertion.findIndex(
      (entry) =>
        entry.threadId === threadId && entry.event.runId === runId && seqOf(entry.event) === seq,
    );
    if (insertionIndex >= 0) {
      this.insertion.splice(insertionIndex, 1);
    }
    if (stored.length === 0) {
      this.events.delete(runId);
      this.nextSeq.delete(runId);
      this.runs?.delete(runId);
    }
    return Promise.resolve(deleted ? { ...deleted } : null);
  }
  dropEmptiedThreadRuns(threadId: string): string[] {
    const removed: string[] = [];
    if (!this.runs) {
      return removed;
    }
    for (const [id, record] of this.runs) {
      if (record.threadId === threadId && !this.events.has(id)) {
        this.runs.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }
}

interface InsertionEntry {
  threadId: string;
  event: SessionEvent;
}

function eventKey(entry: InsertionEntry): string {
  return `${entry.event.runId}:${seqOf(entry.event)}`;
}

function tailKeys(insertion: InsertionEntry[], cutoffIndex: number, threadId: string): Set<string> {
  const keys = new Set<string>();
  for (let index = cutoffIndex; index < insertion.length; index += 1) {
    const entry = insertion[index];
    if (entry && entry.threadId === threadId) {
      keys.add(eventKey(entry));
    }
  }
  return keys;
}

function dropEventsByKeys(
  events: Map<string, SessionEvent[]>,
  nextSeq: Map<string, number>,
  removedKeys: Set<string>,
): void {
  for (const [runId, stored] of events) {
    const kept = stored.filter((event) => !removedKeys.has(`${runId}:${seqOf(event)}`));
    if (kept.length === 0) {
      events.delete(runId);
      nextSeq.delete(runId);
    } else {
      events.set(runId, kept);
    }
  }
}

function countThreadUsers(insertion: InsertionEntry[], threadId: string): number {
  let count = 0;
  for (const entry of insertion) {
    if (entry.threadId === threadId && entry.event.type === 'user') {
      count += 1;
    }
  }
  return count;
}
