import { Injectable } from '@harnesys/brix';
import type { GitRepositoryLayout } from '../../../../domain/source/git-repository-layout.ts';
import {
  type ConfigureCredentialHelperInput,
  type CreateBranchInput,
  type EnsureMaterializedInput,
  type EnsureMaterializedResult,
  SourceDriverPort,
  type SwitchBranchResult,
} from '../../../../domain/source/source-driver.port.ts';
import {
  applyCredentialHelper,
  createWorktreeBranch,
  ensureMaterialized,
  listLocalBranches,
  refreshWorktree,
  switchWorktreeBranch,
  worktreePath,
} from './git-engine.ts';
import {
  createStandaloneWorktree,
  deleteLocalBranch,
  listCheckedOutBranches,
  observeWorktreeGit,
  removeStandaloneWorktree,
} from './git-standalone-worktree.ts';

@Injectable()
export class GitDriver extends SourceDriverPort {
  readonly kind = 'git' as const;

  ensureMaterialized(input: EnsureMaterializedInput): Promise<EnsureMaterializedResult> {
    return ensureMaterialized({
      url: input.url,
      layout: input.layout,
      worktreeId: input.worktreeId,
      branch: input.branch,
    });
  }

  configureCredentialHelper(input: ConfigureCredentialHelperInput): Promise<void> {
    return applyCredentialHelper(input.layout, input.remoteUrl, input.credentialUrl);
  }

  resolveContentRoot(layout: GitRepositoryLayout, worktreeId: string): string {
    return worktreePath(layout, worktreeId);
  }

  refresh(layout: GitRepositoryLayout, worktreeId: string, activeBranch: string): Promise<void> {
    return refreshWorktree(layout, worktreeId, activeBranch);
  }

  switchBranch(
    layout: GitRepositoryLayout,
    worktreeId: string,
    branch: string,
  ): Promise<SwitchBranchResult> {
    return switchWorktreeBranch(layout, worktreeId, branch);
  }

  createBranch(
    layout: GitRepositoryLayout,
    worktreeId: string,
    input: CreateBranchInput,
  ): Promise<SwitchBranchResult | null> {
    return createWorktreeBranch(layout, worktreeId, input.name, {
      checkout: input.checkout,
      from: input.from,
    });
  }

  listLocalBranches(layout: GitRepositoryLayout): Promise<string[]> {
    return listLocalBranches(layout.bareRepoPath);
  }

  createStandaloneWorktree(input: {
    layout: GitRepositoryLayout;
    worktreeId: string;
    branch: string;
    createBranch?: boolean;
    from?: string;
  }): Promise<{ contentRoot: string; branch: string; baseCommit: string }> {
    return createStandaloneWorktree(input);
  }

  removeStandaloneWorktree(layout: GitRepositoryLayout, worktreeId: string): Promise<void> {
    return removeStandaloneWorktree(layout, worktreeId);
  }

  deleteLocalBranch(layout: GitRepositoryLayout, branch: string): Promise<void> {
    return deleteLocalBranch(layout.bareRepoPath, branch);
  }

  listCheckedOutBranches(
    layout: GitRepositoryLayout,
  ): Promise<Array<{ path: string; branch: string | null; head: string | null }>> {
    return listCheckedOutBranches(layout.bareRepoPath);
  }

  observeWorktree(
    layout: GitRepositoryLayout,
    worktreeId: string,
  ): Promise<{ dirty: boolean; unpushed: boolean; branch: string | null; head: string | null }> {
    return observeWorktreeGit(worktreePath(layout, worktreeId));
  }
}
