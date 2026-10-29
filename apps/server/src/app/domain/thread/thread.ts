import type { ThreadKind } from '@harnesys/contracts';

export interface ThreadRecord {
  id: string;
  orgId: string;
  agentId: string;
  originAgentId: string;
  title: string;
  kind: ThreadKind;
  parentThreadId: string | null;
  forkAt: string | null;
  inheritedEventCount: number;
  metadata: Record<string, unknown>;
  issueId?: string | null;
  runProfileId: string | null;
  runDirectory: string | null;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
}

export type ThreadInsert = ThreadRecord;

export type ThreadActiveRunStatus = 'queued' | 'running' | 'needs_input' | 'waiting';

export interface ThreadActiveRun {
  runId: string;
  threadId: string;
  status: ThreadActiveRunStatus;
  leaseExpiresAt?: number;
  startedByUserId?: string;
  via?: 'direct' | 'agent';
  onNodeId?: string | null;
}

export type ThreadPatch = Partial<{
  agentId: string;
  title: string;
  kind: ThreadKind;
  metadata: Record<string, unknown>;
  issueId: string | null;
  runProfileId: string | null;
  runDirectory: string | null;
  lastReadAt: string;
}>;
