import type { ThreadKind, ThreadPolicy } from '@harnesys/contracts';

export interface ThreadRecord {
  id: string;
  orgId: string;
  title: string;
  kind: ThreadKind;
  autoReplyAgentId: string | null;
  policy: ThreadPolicy;
  lastThreadSeq: number;
  conversationCount: number;
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

export type ThreadInsert = Omit<
  ThreadRecord,
  'autoReplyAgentId' | 'policy' | 'lastThreadSeq' | 'conversationCount'
> &
  Partial<
    Pick<ThreadRecord, 'autoReplyAgentId' | 'policy' | 'lastThreadSeq' | 'conversationCount'>
  >;

export function toThreadRecord(rec: ThreadInsert): ThreadRecord {
  return {
    ...rec,
    autoReplyAgentId: rec.autoReplyAgentId ?? null,
    policy: rec.policy ?? { version: 1 },
    lastThreadSeq: rec.lastThreadSeq ?? 0,
    conversationCount: rec.conversationCount ?? 0,
  };
}

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
  title: string;
  kind: ThreadKind;
  autoReplyAgentId: string | null;
  policy: ThreadPolicy;
  metadata: Record<string, unknown>;
  issueId: string | null;
  runProfileId: string | null;
  runDirectory: string | null;
  lastReadAt: string;
}>;

export interface ThreadAgentRecord {
  threadId: string;
  agentId: string;
  createdAt: string;
}

export type ThreadParticipantRole = 'member' | 'blocked';

export interface ThreadParticipantRecord {
  id: string;
  orgId: string;
  threadId: string;
  provider: string;
  providerUserId: string;
  displayName: string;
  username: string | null;
  role: ThreadParticipantRole;
  firstSeenAt: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadParticipantInsert {
  id: string;
  orgId: string;
  threadId: string;
  provider: string;
  providerUserId: string;
  displayName: string;
  username?: string | null;
  role?: ThreadParticipantRole;
  firstSeenAt: string;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
