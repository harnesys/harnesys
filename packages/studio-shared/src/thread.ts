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
export const THREAD_KINDS = ['chat', 'schedule', 'webhook', 'issue', 'connector'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];
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
  originAgentId: string;
  agentName: string;
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
  agentId: string;
  originAgentId: string;
}
export type ThreadSummary = Pick<
  ThreadRecord,
  | 'id'
  | 'title'
  | 'agentId'
  | 'originAgentId'
  | 'agentName'
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
  return threads.filter((thread) => thread.originAgentId === agentId || thread.agentId === agentId);
}
export interface AcceptedRunResponse {
  runId: string;
  status: 'queued' | 'waiting' | 'failed';
}
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
        | 'empty-window';
    };
