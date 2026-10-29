import { Injectable, Logger } from '@harnesys/brix';
import type { DeleteRepositoryWorktreeResponse } from '@harnesys/contracts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import {
  canDeleteWorktree,
  explainWorktreeDeleteBlock,
  worktreeDeleteBlockers,
} from '../../domain/source/repository-worktree.ts';
import {
  SourceDriverMismatchException,
  SourceNotFoundException,
  WorktreeNotCleanException,
  WorktreeNotFoundException,
} from '../../domain/source/source.error.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import { resolveStandaloneRepoRoot } from './resolve-git-worktree.ts';

export interface DeleteRepositoryWorktreeInput {
  orgId: string;
  sourceId: string;
  worktreeId: string;
}

@Injectable()
export class DeleteRepositoryWorktreeUseCase {
  private readonly log: Logger;

  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly driver: SourceDriverPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly hub: FleetHubPort,
    private readonly revisions: OrgConfigRevisionPort,
    private readonly containers: WorkspaceContainerPort,
    logger: Logger,
  ) {
    this.log = logger.child('delete-repository-worktree');
  }

  async execute(input: DeleteRepositoryWorktreeInput): Promise<DeleteRepositoryWorktreeResponse> {
    const source = this.sources.findById(input.orgId, input.sourceId);
    if (!source) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (!hasGitVcs(source)) {
      throw new SourceDriverMismatchException(input.sourceId, 'git', 'no-vcs');
    }
    const row = this.worktrees.findById(input.orgId, input.worktreeId);
    if (!row || row.sourceId !== input.sourceId) {
      throw new WorktreeNotFoundException(input.worktreeId);
    }
    if (row.activeRunId) {
      throw new WorktreeNotCleanException(
        input.worktreeId,
        explainWorktreeDeleteBlock({ activeRun: true, dirty: false, unpushed: false }) ??
          'worktree has active run',
      );
    }
    const localHostId = this.machineConfig.get().id;
    if (row.hostId === localHostId) {
      return this.deleteLocal(input, row.operationId);
    }
    if (!this.hub.hasPeer(row.hostId)) {
      throw new HostOfflineException(row.hostId);
    }
    const now = new Date().toISOString();
    this.worktrees.setState(input.orgId, input.worktreeId, {
      state: 'removing',
      updatedAt: now,
    });
    const command: WorkerCommand = {
      type: 'SOURCE_WORKTREE_REMOVE',
      operationId: row.operationId,
      sourceId: input.sourceId,
      sourceRevision: this.revisions.get(input.orgId).revision,
      worktreeId: input.worktreeId,
    };
    this.commands.enqueue(input.orgId, row.hostId, command);
    this.hub.routeCommand(row.hostId, command);
    return {
      worktreeId: input.worktreeId,
      operationId: row.operationId,
      result: 'removed',
    };
  }

  private async deleteLocal(
    input: DeleteRepositoryWorktreeInput,
    operationId: string,
  ): Promise<DeleteRepositoryWorktreeResponse> {
    const row = this.worktrees.findById(input.orgId, input.worktreeId);
    const mat = row ? this.materializations.find(input.orgId, input.sourceId, row.hostId) : null;
    const gitLayout = {
      bareRepoPath: mat
        ? resolveStandaloneRepoRoot({
            sourceId: input.sourceId,
            hostId: row?.hostId ?? this.machineConfig.get().id,
            origin: mat.origin,
            localPath: mat.localPath,
            managedBarePath: this.layout.orgSourceDir(input.orgId, input.sourceId),
          })
        : this.layout.orgSourceDir(input.orgId, input.sourceId),
      worktreesRoot: this.layout.sourceWorktreesDir(input.orgId, input.sourceId),
    };
    const observation = await this.driver.observeWorktree(gitLayout, input.worktreeId);
    const blockers = worktreeDeleteBlockers({
      activeRunId: null,
      observation,
    });
    if (!canDeleteWorktree(blockers)) {
      throw new WorktreeNotCleanException(
        input.worktreeId,
        explainWorktreeDeleteBlock(blockers) ?? 'worktree is not clean',
      );
    }
    const now = new Date().toISOString();
    this.worktrees.setState(input.orgId, input.worktreeId, {
      state: 'removing',
      updatedAt: now,
    });
    try {
      await this.driver.removeStandaloneWorktree(gitLayout, input.worktreeId);
      this.worktrees.remove(input.orgId, input.worktreeId);
      await this.releaseContainer(input.orgId, input.worktreeId);
      return {
        worktreeId: input.worktreeId,
        operationId,
        result: 'removed',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.worktrees.setState(input.orgId, input.worktreeId, {
        state: 'ready',
        lastErrorCode: 'WORKTREE_NOT_CLEAN',
        updatedAt: new Date().toISOString(),
      });
      throw new WorktreeNotCleanException(input.worktreeId, message);
    }
  }

  private async releaseContainer(orgId: string, worktreeId: string): Promise<void> {
    try {
      await this.containers.release(orgId, `worktree:${worktreeId}`);
    } catch (err) {
      this.log.warn(
        { orgId, worktreeId, err: err instanceof Error ? err.message : String(err) },
        'workspace container release failed',
      );
    }
  }
}
