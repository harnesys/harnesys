import { MaterializationStateFrameSchema } from '@harnesys/contracts';
import type { WSContext } from 'hono/ws';
import { markSiblingCloudCopiesRefreshRequired } from '../../application/source/mark-cloud-siblings-refresh.ts';
import type { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';

interface PeerLink {
  get(): { orgId: string; nodeId: string } | null;
}

export function handleSourceMaterialization(
  frame: Record<string, unknown>,
  ws: WSContext,
  link: PeerLink,
  materializations: SourceMaterializationPort,
  materializationEvents: MaterializationEventsPort,
): void {
  const current = link.get();
  if (current === null) {
    ws.close(1008, 'connect first');
    return;
  }
  const parsed = MaterializationStateFrameSchema.safeParse({
    sourceId: frame.sourceId,
    hostId: frame.hostId ?? current.nodeId,
    revision: frame.revision,
    state: frame.state,
    lastErrorCode: frame.lastErrorCode,
    lastConflictPaths: frame.lastConflictPaths,
    refreshRequired: frame.refreshRequired,
    sourceChanged: frame.sourceChanged,
  });
  if (!parsed.success) {
    return;
  }
  if (parsed.data.hostId !== current.nodeId) {
    return;
  }
  const decision = materializations.upsertProjection({
    orgId: current.orgId,
    sourceId: parsed.data.sourceId,
    hostId: parsed.data.hostId,
    state: parsed.data.state,
    revision: parsed.data.revision,
    lastConfirmedAt: new Date().toISOString(),
    lastErrorCode: parsed.data.lastErrorCode ?? null,
    lastConflictPaths: parsed.data.lastConflictPaths ?? [],
    refreshRequired: parsed.data.refreshRequired === true,
  });
  try {
    ws.send(
      JSON.stringify({
        kind: 'SOURCE_MATERIALIZATION_ACK',
        sourceId: parsed.data.sourceId,
        hostId: parsed.data.hostId,
        revision: parsed.data.revision,
        decision,
      }),
    );
  } catch {
    // ignore
  }
  if (decision === 'applied') {
    if (parsed.data.sourceChanged) {
      markSiblingCloudCopiesRefreshRequired({
        materializations,
        materializationEvents,
        orgId: current.orgId,
        sourceId: parsed.data.sourceId,
        syncedHostId: parsed.data.hostId,
      });
    }
    materializationEvents.emit({
      orgId: current.orgId,
      sourceId: parsed.data.sourceId,
      hostId: parsed.data.hostId,
    });
  }
}

export function handleSourceWorktree(
  frame: Record<string, unknown>,
  ws: WSContext,
  link: PeerLink,
  worktrees: RepositoryWorktreePort,
): void {
  const current = link.get();
  if (current === null) {
    ws.close(1008, 'connect first');
    return;
  }
  if (typeof frame.worktreeId !== 'string' || typeof frame.operationId !== 'string') {
    return;
  }
  const existing = worktrees.findById(current.orgId, frame.worktreeId);
  if (!existing || existing.hostId !== current.nodeId) {
    return;
  }
  const now = new Date().toISOString();
  if (frame.result === 'ready') {
    worktrees.setState(current.orgId, frame.worktreeId, {
      state: 'ready',
      baseCommit: typeof frame.baseCommit === 'string' ? frame.baseCommit : existing.baseCommit,
      lastErrorCode: null,
      updatedAt: now,
    });
  } else if (frame.result === 'removed') {
    worktrees.remove(current.orgId, frame.worktreeId);
  } else if (frame.result === 'failed') {
    worktrees.setState(current.orgId, frame.worktreeId, {
      state: existing.state === 'removing' ? 'ready' : 'failed',
      lastErrorCode: typeof frame.errorCode === 'string' ? frame.errorCode : 'WORKTREE_FAILED',
      updatedAt: now,
    });
  }
  try {
    ws.send(
      JSON.stringify({
        kind: 'SOURCE_WORKTREE_ACK',
        worktreeId: frame.worktreeId,
        operationId: frame.operationId,
      }),
    );
  } catch {
    // ignore
  }
}
