import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface CommitGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  message: string;
}

export interface CommitGitResult {
  ok: true;
}

@Injectable()
export class CommitGitUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: CommitGitInput): Promise<CommitGitResult> {
    const message = input.message.trim();
    if (!message) {
      throw new SourcePathInvalidException('commit message is required');
    }
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      await this.git.commit(cwd, message);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
