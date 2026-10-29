import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import type { GitDiffResponse } from '../../domain/source/git-vcs.types.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface GetGitDiffInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  path: string;
}

@Injectable()
export class GetGitDiffUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: GetGitDiffInput): Promise<GitDiffResponse> {
    const path = input.path.trim();
    if (!path) {
      throw new SourcePathInvalidException('path is required');
    }
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      return await this.git.getDiff(cwd, path);
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
