import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import type { GitCommitDetail } from '../../domain/source/git-vcs.types.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface GetGitShowInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  sha: string;
}

@Injectable()
export class GetGitShowUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: GetGitShowInput): Promise<GitCommitDetail> {
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      return await this.git.show(cwd, input.sha);
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
