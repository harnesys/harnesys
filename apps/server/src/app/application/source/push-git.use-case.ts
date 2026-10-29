import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface PushGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
}

export interface PushGitResult {
  ok: true;
}

@Injectable()
export class PushGitUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: PushGitInput): Promise<PushGitResult> {
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      await this.git.push(cwd);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
