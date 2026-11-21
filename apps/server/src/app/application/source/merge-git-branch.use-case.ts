import { Injectable } from '@harnesys/brix';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface MergeGitBranchInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  branch: string;
}

export interface MergeGitBranchResult {
  ok: true;
}

@Injectable()
export class MergeGitBranchUseCase {
  constructor(
    private readonly machineConfig: MachineConfigPort,
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: MergeGitBranchInput): Promise<MergeGitBranchResult> {
    const branch = input.branch.trim();
    if (!branch) {
      throw new SourcePathInvalidException('branch is required');
    }
    if (input.hostId !== this.machineConfig.get().id) {
      throw new SourcePathInvalidException('git merge on a remote host is not supported yet');
    }
    const resolved = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      await this.git.merge(resolved.cwd, branch);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
