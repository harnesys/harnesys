import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import type { GitCommitSummary } from '../../domain/source/git-vcs.types.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface GetGitLogInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  limit: number;
}

export interface GetGitLogResult {
  commits: GitCommitSummary[];
}

@Injectable()
export class GetGitLogUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: GetGitLogInput): Promise<GetGitLogResult> {
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      return { commits: await this.git.log(cwd, input.limit) };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
