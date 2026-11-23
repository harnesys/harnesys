import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface RevertGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  sha: string;
}

export interface RevertGitResult {
  ok: true;
}

@Injectable()
export class RevertGitUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: RevertGitInput): Promise<RevertGitResult> {
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      await this.git.revert(cwd, input.sha);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
