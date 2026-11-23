import type { SessionEvent } from 'harnesys';

export interface ThreadLogDeletion {
  from: number;
  to: number; // 0 = open-ended
}

export interface ThreadSyncSlice {
  rows: SessionEvent[];
  serverMax: number;
  deletions: ThreadLogDeletion[];
}

export interface ThreadHistoryPageRequest {
  beforeThreadSeq?: number;
  limitRuns?: number;
}

export interface ThreadHistorySlice {
  events: SessionEvent[];
  minThreadSeq: number;
  maxThreadSeq: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  hiddenRunsBefore: number | null;
  firstUserThreadSeq: number | null;
  waitingForProfileId?: string;
  complete: boolean;
}

export abstract class ThreadHistoryPagePort {
  abstract syncSlice(
    orgId: string,
    threadId: string,
    afterThreadSeq: number,
    limit: number,
  ): Promise<ThreadSyncSlice>;
  abstract waitingForProfileId(orgId: string, threadId: string): Promise<string | undefined>;
  abstract listPage(
    orgId: string,
    threadId: string,
    request: ThreadHistoryPageRequest,
  ): Promise<ThreadHistorySlice>;
  abstract listRange(
    orgId: string,
    threadId: string,
    fromThreadSeq: number,
    toThreadSeq: number,
  ): Promise<ThreadHistorySlice>;
  abstract listAround(
    orgId: string,
    threadId: string,
    aroundThreadSeq: number,
  ): Promise<ThreadHistorySlice>;
  abstract listRunSubtree(orgId: string, threadId: string, runId: string): Promise<SessionEvent[]>;
  abstract listToolEvents(orgId: string, threadId: string): Promise<SessionEvent[]>;
}
