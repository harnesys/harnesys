import type {
  Event,
  RequestPlan,
  RequestSection,
  RunLifecycleStatus,
  SessionEvent,
  SessionEventType,
  Snapshot,
} from 'harnesys';

export type { Event, RequestPlan, RequestSection, SessionEvent, SessionEventType, Snapshot };
export const THREAD_KINDS = ['chat', 'group', 'schedule', 'webhook', 'issue'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];
export interface ThreadPolicy {
  version: 1;
  contextWindow?: number;
  mentionGating?: boolean;
}
export interface ThreadMemberRef {
  id: string;
  name: string;
}
export interface ThreadParticipantRef {
  id: string;
  provider: string;
  providerUserId: string;
  displayName: string;
  username: string | null;
  role: 'member' | 'blocked';
  lastSeenAt: string | null;
}
export interface ThreadActiveRun {
  runId: string;
  status: RunLifecycleStatus;
  leaseExpired?: boolean;
  startedByUserId?: string;
  startedByName?: string;
  via?: 'direct' | 'agent';
  onNodeId?: string | null;
  onNodeName?: string;
}
export interface ThreadLastError {
  runId: string;
  message: string;
  at: string;
}
export interface ThreadRecord {
  id: string;
  title: string;
  agentId: string;
  members: ThreadMemberRef[];
  autoReplyAgentId: string | null;
  policy: ThreadPolicy;
  participants: ThreadParticipantRef[];
  projectId: string;
  kind: ThreadKind;
  issueId: string | null;
  parentThreadId: string | null;
  forkAt: string | null;
  inheritedEventCount: number;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
  unread: boolean;
  pinned: boolean;
  runMode?: string;
  runProfileId: string | null;
  runDirectory: string | null;
  bindingLocked: boolean;
  events: SessionEvent[];
  activeRun: ThreadActiveRun | null;
  lastError?: ThreadLastError | null;
}
export interface ThreadAgentRef {
  members: readonly { id: string }[];
  autoReplyAgentId?: string | null;
}
export type ThreadSummary = Pick<
  ThreadRecord,
  | 'id'
  | 'title'
  | 'agentId'
  | 'members'
  | 'autoReplyAgentId'
  | 'policy'
  | 'participants'
  | 'projectId'
  | 'kind'
  | 'issueId'
  | 'parentThreadId'
  | 'forkAt'
  | 'inheritedEventCount'
  | 'createdAt'
  | 'updatedAt'
  | 'lastReadAt'
  | 'unread'
  | 'pinned'
  | 'runMode'
  | 'runProfileId'
  | 'runDirectory'
  | 'bindingLocked'
  | 'activeRun'
  | 'lastError'
>;
export function threadsForAgent<T extends ThreadAgentRef>(
  threads: readonly T[],
  agentId: string,
): T[] {
  return threads.filter((thread) => thread.members.some((member) => member.id === agentId));
}
export function primaryAgentIdOf(thread: ThreadAgentRef): string | undefined {
  const autoReply = thread.autoReplyAgentId ?? undefined;
  if (autoReply && thread.members.some((member) => member.id === autoReply)) {
    return autoReply;
  }
  return thread.members[0]?.id;
}
export interface RunAcceptedResponse {
  status: 'queued' | 'waiting' | 'failed';
  runId: string;
  threadId: string;
  waitingForProfileId?: string;
}
export type StoredMessageReason = 'duplicate' | 'deferred' | 'no_responder';
export interface StoredMessageResponse {
  status: 'stored';
  reason: StoredMessageReason;
  threadId: string;
  threadSeq: number;
}
export type AcceptedRunResponse = RunAcceptedResponse | StoredMessageResponse;
export type CompactThreadResponse =
  | {
      compacted: true;
      id: string;
      coveredFrom: number;
      coveredUntil: number;
      tokensBefore: number;
      tokensAfter: number;
    }
  | {
      compacted: false;
      reason?:
        | 'no-context-window'
        | 'invalid-output-reserve'
        | 'empty-history'
        | 'resume-pending'
        | 'already-covered'
        | 'no-cut-plan'
        | 'hook-blocked'
        | 'empty-window'
        | 'breaker-open'
        | 'rapid-refill'
        | 'compaction-in-progress'
        | 'cancelled';
    };
