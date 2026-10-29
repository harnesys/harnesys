import { Injectable } from '@harnesys/brix';
import { mapGitVcsError } from './map-git-vcs-error.ts';
import { SwitchGitBranchUseCase } from './switch-git-branch.use-case.ts';

export interface CheckoutGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  branch: string;
}

export interface CheckoutGitResult {
  ok: true;
}

@Injectable()
export class CheckoutGitUseCase {
  constructor(private readonly switchGitBranch: SwitchGitBranchUseCase) {}

  async execute(input: CheckoutGitInput): Promise<CheckoutGitResult> {
    try {
      await this.switchGitBranch.execute(input);
      return { ok: true };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
