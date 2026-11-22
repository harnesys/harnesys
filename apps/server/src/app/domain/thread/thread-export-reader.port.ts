export interface ThreadExportEvent {
  threadSeq: number;
  runId: string | null;
  seq: number | null;
  type: string;
  timestamp: number;
  metadata: string | null;
  conversational: boolean;
  clientEventId: string | null;
}

export interface ThreadExportRun {
  runId: string;
  threadId: string;
  agentId: string | null;
  agentName: string;
  status: string;
  interruptId: string | null;
  waitFireAt: number | null;
  parentRunId: string | null;
  attempt: number;
  leaseInstanceId: string | null;
  leaseExpiresAt: number | null;
  leaseEpoch: number;
  lastSeq: number;
  startedByUserId: string | null;
  via: string;
  onNodeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadExportSnapshot {
  runId: string;
  sessionId: string;
  status: string;
  runtimeVersion: string;
  updatedAt: number;
  snapshot: string;
}

export interface ThreadExportPlan {
  snapshot: string;
  createdAt: string;
  updatedAt: string;
}

export abstract class ThreadExportReaderPort {
  abstract readEvents(orgId: string, threadId: string): Promise<ThreadExportEvent[]>;
  abstract readRuns(orgId: string, threadId: string): Promise<ThreadExportRun[]>;
  abstract readSnapshots(orgId: string, threadId: string): Promise<ThreadExportSnapshot[]>;
  abstract readPlan(orgId: string, threadId: string): Promise<ThreadExportPlan | null>;
}
