import type {
  MaterializationState,
  SourceHostNodeStatus,
  SourceHostStatus,
} from '@harnesys/contracts';

export interface MaterializationStatusView {
  state: MaterializationState;
  lastConfirmedAt: string | null;
  errorCode: string | null;
  defaultWorktreeId?: string | null;
  lastConflictPaths?: string[];
  refreshRequired?: boolean;
}

export function mergeSourceHostStatus(
  hostId: string,
  nodeStatus: SourceHostNodeStatus,
  view: MaterializationStatusView | null,
): SourceHostStatus {
  if (!view) {
    return {
      hostId,
      nodeStatus,
      materialization: 'absent',
      lastConfirmedAt: null,
      errorCode: null,
      stale: false,
      defaultWorktreeId: null,
      lastConflictPaths: [],
      refreshRequired: false,
    };
  }
  const confirmed = view.lastConfirmedAt !== null;
  const stale = nodeStatus !== 'online' && confirmed;
  return {
    hostId,
    nodeStatus,
    materialization: view.state,
    lastConfirmedAt: view.lastConfirmedAt,
    errorCode: view.errorCode,
    stale,
    defaultWorktreeId: view.defaultWorktreeId ?? null,
    lastConflictPaths: view.lastConflictPaths ?? [],
    refreshRequired: view.refreshRequired === true,
  };
}
