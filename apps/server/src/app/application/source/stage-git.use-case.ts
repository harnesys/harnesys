import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface StageGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  paths: string[];
}

export interface StageGitResult {
  ok: true;
}

@Injectable()
export class StageGitUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: StageGitInput): Promise<StageGitResult> {
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      await this.git.stage(cwd, input.paths);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
