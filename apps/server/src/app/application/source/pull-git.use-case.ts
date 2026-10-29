import { Injectable } from '@harnesys/brix';
import { mapGitVcsError } from './map-git-vcs-error.ts';
import { RefreshGitSourceUseCase } from './refresh-git-source.use-case.ts';

export interface PullGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
}

export interface PullGitResult {
  ok: true;
}

@Injectable()
export class PullGitUseCase {
  constructor(private readonly refreshGit: RefreshGitSourceUseCase) {}

  async execute(input: PullGitInput): Promise<PullGitResult> {
    try {
      await this.refreshGit.execute(input);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
