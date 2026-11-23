import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface FetchGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
}

export interface FetchGitResult {
  ok: true;
}

@Injectable()
export class FetchGitUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: FetchGitInput): Promise<FetchGitResult> {
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      await this.git.fetch(cwd);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
