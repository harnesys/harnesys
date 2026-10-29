import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { RepositoryWorktree } from '../../domain/source/repository-worktree.ts';
import { decideStaleCreatingRecovery } from '../../domain/source/repository-worktree.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';

export interface RecoverStaleWorktreesDeps {
  orgId: string;
  worktrees: RepositoryWorktreePort;
  driver: SourceDriverPort;
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
}

const LOCAL_RECOVERY_GRACE_MS = 60_000;
const REMOTE_STALE_CREATING_MS = 30 * 60_000;

export async function recoverStaleWorktrees(
  deps: RecoverStaleWorktreesDeps,
  now = new Date(),
): Promise<number> {
  const localHostId = deps.machineConfig.get().id;
  const rows = deps.worktrees.listCreating(deps.orgId);
  let recovered = 0;
  for (const row of rows) {
    const isLocalHost = row.hostId === localHostId;
    const head = isLocalHost ? await observeHead(deps, row) : null;
    const action = decideStaleCreatingRecovery({
      isLocalHost,
      head,
      ageMs: now.getTime() - Date.parse(row.createdAt),
      localGraceMs: LOCAL_RECOVERY_GRACE_MS,
      remoteStaleMs: REMOTE_STALE_CREATING_MS,
    });
    if (action.kind === 'keep') {
      continue;
    }
    deps.worktrees.setState(deps.orgId, row.id, {
      state: action.kind === 'adopt' ? 'ready' : 'failed',
      ...(action.kind === 'adopt' ? { baseCommit: action.head } : {}),
      ...(action.kind === 'fail' ? { lastErrorCode: action.reason } : {}),
      updatedAt: now.toISOString(),
    });
    recovered += 1;
  }
  return recovered;
}

async function observeHead(deps: RecoverStaleWorktreesDeps, row: RepositoryWorktree) {
  try {
    const observation = await deps.driver.observeWorktree(
      {
        bareRepoPath: deps.layout.orgSourceDir(deps.orgId, row.sourceId),
        worktreesRoot: deps.layout.sourceWorktreesDir(deps.orgId, row.sourceId),
      },
      row.id,
    );
    if (!observation.head) {
      return null;
    }
    return observation.branch === row.branch || observation.branch === null
      ? observation.head
      : null;
  } catch {
    return null;
  }
}
