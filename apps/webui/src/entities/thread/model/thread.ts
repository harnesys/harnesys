import type {
  ThreadActiveRun,
  ThreadKind,
  ThreadLastError,
  ThreadMemberRef,
  ThreadParticipantRef,
  ThreadPolicy,
} from '@harnesys/studio-shared';
export interface Thread {
  id: string;
  agentId: string;
  members: ThreadMemberRef[];
  autoReplyAgentId?: string | null;
  policy?: ThreadPolicy;
  participants?: ThreadParticipantRef[];
  orgId?: string;
  title: string;
  kind: ThreadKind;
  issueId?: string | null;
  parentThreadId?: string | null;
  forkAt?: string | null;
  inheritedEventCount?: number;
  createdAt?: string;
  updatedAt: string;
  unread: boolean;
  pinned?: boolean;
  runMode?: string;
  runProfileId?: string | null;
  runDirectory?: string | null;
  bindingLocked?: boolean;
  activeRunId?: string | null;
  activeRun?: ThreadActiveRun | null;
  lastError?: ThreadLastError | null;
}
export function latestThread(threads: Thread[]): Thread | undefined {
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
