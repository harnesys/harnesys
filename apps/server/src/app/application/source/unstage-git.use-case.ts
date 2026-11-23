import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface UnstageGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  paths: string[];
}

export interface UnstageGitResult {
  ok: true;
}

@Injectable()
export class UnstageGitUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: UnstageGitInput): Promise<UnstageGitResult> {
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      await this.git.unstage(cwd, input.paths);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
