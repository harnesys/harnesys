import type {
  RunLifecycleStatus,
  ThreadActiveRun,
  ThreadMember,
  ThreadParticipant,
  ThreadPublic,
  ThreadSummary,
} from '@harnesys/contracts';
import type { RunAttribution, RunVia } from 'harnesys';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ThreadInvariantException } from '../../domain/thread/thread.error.ts';
import type {
  ThreadActiveRun as StoredActiveRun,
  ThreadInsert,
  ThreadParticipantRecord,
  ThreadRecord,
} from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export const DEFAULT_THREAD_TITLE = 'New chat';

export interface ThreadSummaryDeps {
  threadAgents: ThreadAgentRepositoryPort;
  participants: ThreadParticipantRepositoryPort;
  agents: AgentRegistryPort;
}

export function insertAgentThread(
  deps: { threads: ThreadRepositoryPort; threadAgents: ThreadAgentRepositoryPort },
  rec: ThreadInsert,
  agentId: string,
): ThreadRecord {
  const thread = deps.threads.insert(rec);
  deps.threadAgents.ensure(rec.orgId, thread.id, agentId);
  return thread;
}

export function membersOf(
  deps: ThreadSummaryDeps,
  orgId: string,
  threadId: string,
): ThreadMember[] {
  const agentNames = new Map(
    deps.agents.list(orgId).map((agent) => [agent.id, agent.name] as const),
  );
  return deps.threadAgents
    .listByThread(orgId, threadId)
    .map((row) => ({ id: row.agentId, name: agentNames.get(row.agentId) ?? row.agentId }));
}

export function membersByThread(
  deps: ThreadSummaryDeps,
  orgId: string,
  threadIds: string[],
): Map<string, ThreadMember[]> {
  const agentNames = new Map(
    deps.agents.list(orgId).map((agent) => [agent.id, agent.name] as const),
  );
  const out = new Map<string, ThreadMember[]>();
  for (const row of deps.threadAgents.listByThreads(orgId, threadIds)) {
    const list = out.get(row.threadId) ?? [];
    list.push({ id: row.agentId, name: agentNames.get(row.agentId) ?? row.agentId });
    out.set(row.threadId, list);
  }
  return out;
}

export function participantsOf(
  deps: ThreadSummaryDeps,
  orgId: string,
  threadId: string,
): ThreadParticipant[] {
  return deps.participants.listByThread(orgId, threadId).map(toParticipant);
}

export function toParticipant(record: ThreadParticipantRecord): ThreadParticipant {
  return {
    id: record.id,
    provider: record.provider,
    providerUserId: record.providerUserId,
    displayName: record.displayName,
    username: record.username,
    role: record.role,
    lastSeenAt: record.lastSeenAt,
  };
}

function deriveThreadTitle(text: string, maxChars = 48): string | undefined {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}...`;
}

export function applyDerivedThreadTitle(input: {
  threads: ThreadRepositoryPort;
  orgId: string;
  thread: { id: string; kind: string; title: string };
  text: string | undefined;
}): void {
  if (input.thread.kind !== 'chat' || input.thread.title !== DEFAULT_THREAD_TITLE) {
    return;
  }
  const next = deriveThreadTitle(input.text ?? '');
  if (!next) {
    return;
  }
  input.threads.updateTitle(input.orgId, input.thread.id, next);
}

export function isThreadUnread(updatedAt: string, lastReadAt: string): boolean {
  return updatedAt > lastReadAt;
}

export function unreadOf(input: {
  thread: ThreadRecord;
  participants: ThreadParticipant[];
  userId?: string | null;
}): boolean {
  const { thread, participants, userId } = input;
  if (thread.kind === 'group' && userId) {
    const me = participants.find(
      (item) => item.provider === 'app' && item.providerUserId === userId,
    );
    return isThreadUnread(thread.updatedAt, me?.lastSeenAt ?? thread.createdAt);
  }
  return isThreadUnread(thread.updatedAt, thread.lastReadAt);
}

export interface RunAttributionNames {
  userNameOf: (userId: string) => string | undefined;
  nodeNameOf: (nodeId: string) => string | undefined;
}

export type ActiveRunSource =
  | StoredActiveRun
  | {
      runId: string;
      status: string;
      leaseExpiresAt?: number;
      attribution?: RunAttribution;
    };

function attributionOf(active: ActiveRunSource): {
  startedByUserId?: string;
  via?: RunVia;
  onNodeId?: string | null;
} {
  const record = active as { attribution?: RunAttribution };
  if (record.attribution) {
    return {
      startedByUserId: record.attribution.startedByUserId,
      via: record.attribution.via,
      onNodeId: record.attribution.onNodeId ?? null,
    };
  }
  const stored = active as StoredActiveRun;
  return {
    startedByUserId: stored.startedByUserId,
    via: stored.via,
    onNodeId: stored.onNodeId ?? null,
  };
}

export function activeRunOf(
  active: ActiveRunSource | null,
  waitingForProfileId?: string,
  names?: RunAttributionNames,
): ThreadActiveRun | null {
  if (!active) {
    return null;
  }
  const leaseExpired =
    active.status === 'running' &&
    active.leaseExpiresAt !== undefined &&
    active.leaseExpiresAt < Date.now();
  const attribution = attributionOf(active);
  const onNodeId = attribution.onNodeId;
  return {
    runId: active.runId,
    status: active.status as RunLifecycleStatus,
    leaseExpired: leaseExpired || undefined,
    waitingForProfileId:
      active.status === 'waiting' && waitingForProfileId ? waitingForProfileId : undefined,
    startedByUserId: attribution.startedByUserId,
    startedByName:
      attribution.startedByUserId && names
        ? names.userNameOf(attribution.startedByUserId)
        : undefined,
    via: attribution.via,
    onNodeId,
    onNodeName:
      onNodeId !== null && onNodeId !== undefined && names ? names.nodeNameOf(onNodeId) : undefined,
  };
}

export function pinnedOf(thread: ThreadRecord): boolean {
  return thread.metadata.pinned === true;
}

export function runModeOf(thread: ThreadRecord): string | undefined {
  const mode = thread.metadata.runMode;
  return typeof mode === 'string' ? mode : undefined;
}

export function lastErrorOf(
  thread: ThreadRecord,
): { runId: string; message: string; at: string } | null {
  const lastError = thread.metadata.lastError;
  if (typeof lastError !== 'object' || lastError === null) {
    return null;
  }
  const record = lastError as Record<string, unknown>;
  const runId = record.runId;
  const message = record.message;
  const at = record.at;
  if (typeof runId !== 'string' || typeof message !== 'string' || typeof at !== 'string') {
    return null;
  }
  return { runId, message, at };
}

export interface ThreadSummaryInput {
  thread: ThreadRecord;
  members: ThreadMember[];
  participants: ThreadParticipant[];
  active: ActiveRunSource | null;
  waitingForProfileId?: string;
  names?: RunAttributionNames;
  bindingLocked?: boolean;
  userId?: string | null;
}

export function primaryAgentIdOf(thread: ThreadRecord, memberIds: string[]): string | undefined {
  const autoReply = thread.autoReplyAgentId;
  if (autoReply && memberIds.includes(autoReply)) {
    return autoReply;
  }
  return memberIds[0];
}

export function toThreadSummary(input: ThreadSummaryInput): ThreadSummary {
  const { thread, members, participants, active, bindingLocked, names, waitingForProfileId } =
    input;
  const agentId = primaryAgentIdOf(
    thread,
    members.map((member) => member.id),
  );
  if (!agentId) {
    throw new ThreadInvariantException(`thread ${thread.id} has no member agents`, {
      threadId: thread.id,
    });
  }
  return {
    id: thread.id,
    orgId: thread.orgId,
    title: thread.title,
    agentId,
    members,
    autoReplyAgentId: thread.autoReplyAgentId,
    policy: thread.policy,
    participants,
    kind: thread.kind,
    issueId: thread.issueId ?? null,
    parentThreadId: thread.parentThreadId,
    forkAt: thread.forkAt,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastReadAt: thread.lastReadAt,
    unread: unreadOf({ thread, participants, userId: input.userId }),
    pinned: pinnedOf(thread),
    runMode: runModeOf(thread),
    runProfileId: thread.runProfileId ?? null,
    runDirectory: thread.runDirectory ?? null,
    bindingLocked: bindingLocked ?? false,
    activeRun: activeRunOf(active, waitingForProfileId, names),
    lastError: lastErrorOf(thread),
  };
}

export function toThreadPublic(
  input: ThreadSummaryInput & { events: unknown[]; inheritedEventCount?: number },
): ThreadPublic {
  return {
    ...toThreadSummary(input),
    events: input.events,
    inheritedEventCount: input.inheritedEventCount ?? 0,
  };
}

export function toThreadPublicForAgent(input: {
  thread: ThreadRecord;
  agentId: string;
  agentName: string;
  active: ActiveRunSource | null;
  events: unknown[];
  inheritedEventCount?: number;
}): ThreadPublic {
  return toThreadPublic({
    thread: input.thread,
    members: [{ id: input.agentId, name: input.agentName }],
    participants: [],
    active: input.active,
    events: input.events,
    inheritedEventCount: input.inheritedEventCount ?? 0,
  });
}

export function waitingForProfileIdFromEvents(events: unknown[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event || typeof event !== 'object') {
      continue;
    }
    const record = event as Record<string, unknown>;
    if (record.type === 'placement.decided' && typeof record.profileId === 'string') {
      if (typeof record.selectedNodeId !== 'string') {
        return record.profileId;
      }
    }
    if (record.type !== 'wait.started' || typeof record.prompt !== 'string') {
      continue;
    }
    const match = /^waiting for profile (.+)$/.exec(record.prompt);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}
