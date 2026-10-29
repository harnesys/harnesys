import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { RepositoryWorktree as PublicWorktree } from '@harnesys/contracts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { RepositoryWorktree } from '../../domain/source/repository-worktree.ts';
import {
  GitOperationException,
  SourceDriverMismatchException,
  SourceNotFoundException,
  SourcePathInvalidException,
  WorktreeBranchInUseException,
  WorktreeSourceNotReadyException,
} from '../../domain/source/source.error.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import type { MaterializationRecord } from '../../domain/source/source-materialization.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import { resolveStandaloneRepoRoot } from './resolve-git-worktree.ts';
import { toPublicWorktree } from './to-public-worktree.ts';

export interface CreateRepositoryWorktreeInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  operationId: string;
  branch: string;
  createBranch?: boolean;
  from?: string;
  issueId?: string | null;
}

@Injectable()
export class CreateRepositoryWorktreeUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly driver: SourceDriverPort,
    private readonly nodes: NodeRepository,
    private readonly commands: NodeCommandQueuePort,
    private readonly hub: FleetHubPort,
    private readonly revisions: OrgConfigRevisionPort,
  ) {}

  async execute(input: CreateRepositoryWorktreeInput): Promise<PublicWorktree> {
    const branch = input.branch.trim();
    if (!branch) {
      throw new SourcePathInvalidException('branch is required');
    }
    const source = this.sources.findById(input.orgId, input.sourceId);
    if (!source) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (!hasGitVcs(source)) {
      throw new SourceDriverMismatchException(input.sourceId, 'git', 'no-vcs');
    }
    const existingOp = this.worktrees.findByOperationId(input.orgId, input.operationId);
    if (existingOp) {
      return toPublicWorktree(existingOp, null);
    }
    const node = this.nodes.findById(input.orgId, input.hostId);
    if (!node) {
      throw new SourcePathInvalidException(`unknown host: ${input.hostId}`);
    }
    const mat = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    const projection = this.materializations.findProjection(
      input.orgId,
      input.sourceId,
      input.hostId,
    );
    if (mat?.state !== 'ready' && projection?.state !== 'ready') {
      throw new WorktreeSourceNotReadyException(input.sourceId, input.hostId);
    }
    const occupied = this.worktrees.findActiveByBranch(
      input.orgId,
      input.sourceId,
      input.hostId,
      branch,
    );
    if (occupied && !input.createBranch) {
      throw new WorktreeBranchInUseException(branch, occupied.id);
    }
    const creating = this.reserveCreating(input, branch);
    if (input.hostId === this.machineConfig.get().id) {
      return this.createLocal(input, creating.id, branch, mat);
    }
    return this.dispatchRemoteCreate(input, creating, branch);
  }

  private reserveCreating(
    input: CreateRepositoryWorktreeInput,
    branch: string,
  ): RepositoryWorktree {
    const now = new Date().toISOString();
    try {
      return this.worktrees.upsert({
        id: randomUUID(),
        orgId: input.orgId,
        sourceId: input.sourceId,
        hostId: input.hostId,
        branch,
        baseCommit: null,
        state: 'creating',
        activeRunId: null,
        operationId: input.operationId,
        issueId: input.issueId ?? null,
        lastErrorCode: null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      const occupied =
        err instanceof Error && err.message.includes('UNIQUE constraint failed')
          ? this.worktrees.findActiveByBranch(input.orgId, input.sourceId, input.hostId, branch)
          : null;
      if (occupied) {
        throw new WorktreeBranchInUseException(branch, occupied.id);
      }
      throw err;
    }
  }

  private dispatchRemoteCreate(
    input: CreateRepositoryWorktreeInput,
    creating: RepositoryWorktree,
    branch: string,
  ): PublicWorktree {
    if (!this.hub.hasPeer(input.hostId)) {
      this.worktrees.setState(input.orgId, creating.id, {
        state: 'failed',
        lastErrorCode: 'HOST_OFFLINE',
        updatedAt: new Date().toISOString(),
      });
      throw new HostOfflineException(input.hostId);
    }
    const command: WorkerCommand = {
      type: 'SOURCE_WORKTREE_CREATE',
      operationId: input.operationId,
      sourceId: input.sourceId,
      sourceRevision: this.revisions.get(input.orgId).revision,
      worktreeId: creating.id,
      branch,
      createBranch: input.createBranch === true,
      ...(input.from ? { from: input.from } : {}),
    };
    this.commands.enqueue(input.orgId, input.hostId, command);
    this.hub.routeCommand(input.hostId, command);
    return toPublicWorktree(creating, null);
  }

  private async createLocal(
    input: CreateRepositoryWorktreeInput,
    worktreeId: string,
    branch: string,
    mat: MaterializationRecord | null | undefined,
  ): Promise<PublicWorktree> {
    const gitLayout = {
      bareRepoPath: mat
        ? resolveStandaloneRepoRoot({
            sourceId: input.sourceId,
            hostId: input.hostId,
            origin: mat.origin,
            localPath: mat.localPath,
            managedBarePath: this.layout.orgSourceDir(input.orgId, input.sourceId),
          })
        : this.layout.orgSourceDir(input.orgId, input.sourceId),
      worktreesRoot: this.layout.ensureSourceWorktreesDir(input.orgId, input.sourceId),
    };
    try {
      const checkedOut = await this.driver.listCheckedOutBranches(gitLayout);
      const occupiedPath = checkedOut.find((entry) => entry.branch === branch);
      if (occupiedPath && !input.createBranch) {
        this.worktrees.remove(input.orgId, worktreeId);
        throw new WorktreeBranchInUseException(branch, worktreeId);
      }
      const created = await this.driver.createStandaloneWorktree({
        layout: gitLayout,
        worktreeId,
        branch,
        createBranch: input.createBranch === true,
        from: input.from,
      });
      const readyAt = new Date().toISOString();
      const ready = this.worktrees.upsert({
        id: worktreeId,
        orgId: input.orgId,
        sourceId: input.sourceId,
        hostId: input.hostId,
        branch: created.branch,
        baseCommit: created.baseCommit,
        state: 'ready',
        activeRunId: null,
        operationId: input.operationId,
        issueId: input.issueId ?? null,
        lastErrorCode: null,
        createdAt: readyAt,
        updatedAt: readyAt,
      });
      const observation = await this.driver.observeWorktree(gitLayout, worktreeId);
      return toPublicWorktree(ready, observation);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof WorktreeBranchInUseException) {
        this.worktrees.setState(input.orgId, worktreeId, {
          state: 'failed',
          lastErrorCode: 'BRANCH_IN_USE',
          updatedAt: new Date().toISOString(),
        });
        throw err;
      }
      if (message.includes('already checked out') || message.includes('branch already exists')) {
        this.worktrees.setState(input.orgId, worktreeId, {
          state: 'failed',
          lastErrorCode: 'BRANCH_IN_USE',
          updatedAt: new Date().toISOString(),
        });
        throw new WorktreeBranchInUseException(branch, worktreeId);
      }
      this.worktrees.setState(input.orgId, worktreeId, {
        state: 'failed',
        lastErrorCode: 'WORKTREE_CREATE_FAILED',
        updatedAt: new Date().toISOString(),
      });
      throw err instanceof GitOperationException ? err : new GitOperationException(message);
    }
  }
}
