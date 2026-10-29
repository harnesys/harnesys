import type { MaterializationState } from '@harnesys/contracts';

export type CloudSyncOutcome =
  | 'uploaded'
  | 'keep-both'
  | 'revision-unknown'
  | 'folder-created'
  | 'deleted';

export interface CloudMaterializationSyncView {
  state: MaterializationState;
  lastConflictPaths: string[];
  errorCode: string | null;
  refreshRequired: boolean;
}

export function applyCloudSyncOutcome(
  current: CloudMaterializationSyncView,
  outcome: CloudSyncOutcome,
  conflictPath?: string,
): CloudMaterializationSyncView {
  if (outcome === 'revision-unknown') {
    return {
      state: 'failed',
      lastConflictPaths: current.lastConflictPaths,
      errorCode: 'CLOUD_REVISION_UNKNOWN',
      refreshRequired: true,
    };
  }
  const lastConflictPaths =
    outcome === 'keep-both' && conflictPath
      ? appendConflictPath(current.lastConflictPaths, conflictPath)
      : current.lastConflictPaths;
  return {
    state: 'ready',
    lastConflictPaths,
    errorCode: null,
    refreshRequired: false,
  };
}

export function appendConflictPath(paths: string[], conflictPath: string): string[] {
  if (paths.includes(conflictPath)) {
    return paths;
  }
  return [...paths, conflictPath].slice(-20);
}

export function siblingRefreshFlag(hostId: string, syncedHostId: string): boolean {
  return hostId !== syncedHostId;
}
