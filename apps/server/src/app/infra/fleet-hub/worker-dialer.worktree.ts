import type { Logger } from '@harnesys/brix';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import type { DialerSession } from './worker-dialer.session.ts';

export interface WorkerWorktreeDeps {
  layout: HostFsLayoutPort;
  machineConfig: MachineConfigPort;
  driver: SourceDriverPort;
  containers: WorkspaceContainerPort;
  log: Logger;
}

export async function runSourceWorktreeCreate(
  deps: WorkerWorktreeDeps,
  session: DialerSession,
  command: {
    operationId: string;
    sourceId: string;
    worktreeId: string;
    branch: string;
    createBranch: boolean;
    from?: string;
  },
): Promise<void> {
  const gitLayout = {
    bareRepoPath: deps.layout.orgSourceDir(session.identity.orgId, command.sourceId),
    worktreesRoot: deps.layout.ensureSourceWorktreesDir(session.identity.orgId, command.sourceId),
  };
  try {
    const created = await deps.driver.createStandaloneWorktree({
      layout: gitLayout,
      worktreeId: command.worktreeId,
      branch: command.branch,
      createBranch: command.createBranch,
      from: command.from,
    });
    emitWorktreeResult(session, {
      worktreeId: command.worktreeId,
      operationId: command.operationId,
      sourceId: command.sourceId,
      hostId: deps.machineConfig.get().id,
      result: 'ready',
      branch: created.branch,
      baseCommit: created.baseCommit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitWorktreeResult(session, {
      worktreeId: command.worktreeId,
      operationId: command.operationId,
      sourceId: command.sourceId,
      hostId: deps.machineConfig.get().id,
      result: 'failed',
      errorCode: worktreeCreateErrorCode(message),
    });
  }
}

function worktreeCreateErrorCode(message: string): string {
  if (message.includes('already checked out') || message.includes('branch already exists')) {
    return 'BRANCH_IN_USE';
  }
  return 'SOURCE_NOT_READY';
}

export async function runSourceWorktreeRemove(
  deps: WorkerWorktreeDeps,
  session: DialerSession,
  command: {
    operationId: string;
    sourceId: string;
    worktreeId: string;
  },
): Promise<void> {
  const gitLayout = {
    bareRepoPath: deps.layout.orgSourceDir(session.identity.orgId, command.sourceId),
    worktreesRoot: deps.layout.sourceWorktreesDir(session.identity.orgId, command.sourceId),
  };
  try {
    await deps.driver.removeStandaloneWorktree(gitLayout, command.worktreeId);
    await releaseWorkspaceContainer(deps, session.identity.orgId, `worktree:${command.worktreeId}`);
    emitWorktreeResult(session, {
      worktreeId: command.worktreeId,
      operationId: command.operationId,
      sourceId: command.sourceId,
      hostId: deps.machineConfig.get().id,
      result: 'removed',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitWorktreeResult(session, {
      worktreeId: command.worktreeId,
      operationId: command.operationId,
      sourceId: command.sourceId,
      hostId: deps.machineConfig.get().id,
      result: 'failed',
      errorCode: 'WORKTREE_NOT_CLEAN',
      message,
    });
  }
}

async function releaseWorkspaceContainer(
  deps: WorkerWorktreeDeps,
  orgId: string,
  workspaceKey: string,
): Promise<void> {
  try {
    await deps.containers.release(orgId, workspaceKey);
  } catch (err) {
    deps.log.warn(
      { orgId, workspaceKey, err: err instanceof Error ? err.message : String(err) },
      'workspace container release failed',
    );
  }
}

function emitWorktreeResult(
  session: DialerSession,
  payload: {
    worktreeId: string;
    operationId: string;
    sourceId: string;
    hostId: string;
    result: 'ready' | 'removed' | 'failed';
    branch?: string;
    baseCommit?: string;
    errorCode?: string;
    message?: string;
  },
): void {
  try {
    session.socket?.send(
      JSON.stringify({
        kind: 'SOURCE_WORKTREE',
        ...payload,
      }),
    );
  } catch {
    // ignore
  }
}
