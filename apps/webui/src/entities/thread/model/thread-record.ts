import type { ThreadRecord, ThreadSummary } from '@harnesys/studio-shared';
import type { Thread } from './thread';
export function toClientThread(record: ThreadSummary | ThreadRecord): Thread {
  const orgId =
    'orgId' in record && typeof record.orgId === 'string' ? record.orgId : record.projectId;
  return {
    id: record.id,
    agentId: record.agentId,
    originAgentId: record.originAgentId,
    orgId,
    title: record.title,
    kind: record.kind,
    issueId: record.issueId ?? null,
    parentThreadId: record.parentThreadId,
    forkAt: record.forkAt,
    inheritedEventCount: record.inheritedEventCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    unread: record.unread,
    pinned: record.pinned,
    runMode: record.runMode,
    runProfileId: record.runProfileId,
    runDirectory: record.runDirectory,
    bindingLocked: record.bindingLocked,
    activeRunId: record.activeRun?.runId ?? null,
    activeRun: record.activeRun ?? null,
    lastError: record.lastError ?? null,
  };
}
