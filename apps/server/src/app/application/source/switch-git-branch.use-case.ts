import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { toPublicSource } from './to-public-source.ts';

export interface SwitchGitBranchInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  branch: string;
}

@Injectable()
export class SwitchGitBranchUseCase {
  constructor(
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly worktrees: GitWorktreeResolver,
    private readonly driver: SourceDriverPort,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: SwitchGitBranchInput): Promise<Source> {
    const branch = input.branch.trim();
    if (!branch) {
      throw new SourcePathInvalidException('branch is required');
    }
    if (input.hostId !== this.machineConfig.get().id) {
      throw new SourcePathInvalidException('git checkout on a remote host is not supported yet');
    }
    const resolved = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    const updatedAt = new Date().toISOString();
    if (resolved.kind === 'inplace') {
      await this.git.checkout(resolved.cwd, branch);
      return toPublicSource(resolved.record, updatedAt);
    }
    const switched = await this.driver.switchBranch(
      resolved.config.layout,
      resolved.config.worktreeId,
      branch,
    );
    const existing = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    this.materializations.upsert({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      origin: 'managed',
      localPath: switched.contentRoot,
      state: 'ready',
      revision: (existing?.revision ?? 0) + 1,
      updatedAt,
    });
    return toPublicSource(resolved.record, updatedAt);
  }
}
