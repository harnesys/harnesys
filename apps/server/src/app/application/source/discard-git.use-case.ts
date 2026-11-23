import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface DiscardGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  paths: string[];
  untrackedPaths: string[];
}

export interface DiscardGitResult {
  ok: true;
}

@Injectable()
export class DiscardGitUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: DiscardGitInput): Promise<DiscardGitResult> {
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      await this.git.discard(cwd, input.paths, input.untrackedPaths);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
