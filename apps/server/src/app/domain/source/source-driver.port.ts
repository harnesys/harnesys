import type { GitRepositoryLayout } from './git-repository-layout.ts';

export type { GitRepositoryLayout };

export interface EnsureMaterializedInput {
  orgId: string;
  sourceId: string;
  url: string;
  worktreeId: string;
  branch?: string;
  layout: GitRepositoryLayout;
}

export interface EnsureMaterializedResult {
  activeBranch: string;
  contentRoot: string;
  layout: GitRepositoryLayout;
}

export interface SwitchBranchResult {
  activeBranch: string;
  contentRoot: string;
}

export interface CreateBranchInput {
  name: string;
  checkout: boolean;
  from?: string;
}

export interface ConfigureCredentialHelperInput {
  layout: GitRepositoryLayout;
  remoteUrl: string;
  credentialUrl: string;
}

export abstract class SourceDriverPort {
  abstract readonly kind: 'git';

  abstract ensureMaterialized(input: EnsureMaterializedInput): Promise<EnsureMaterializedResult>;

  abstract configureCredentialHelper(input: ConfigureCredentialHelperInput): Promise<void>;

  abstract resolveContentRoot(layout: GitRepositoryLayout, worktreeId: string): string;

  abstract refresh(
    layout: GitRepositoryLayout,
    worktreeId: string,
    activeBranch: string,
  ): Promise<void>;

  abstract switchBranch(
    layout: GitRepositoryLayout,
    worktreeId: string,
    branch: string,
  ): Promise<SwitchBranchResult>;

  abstract createBranch(
    layout: GitRepositoryLayout,
    worktreeId: string,
    input: CreateBranchInput,
  ): Promise<SwitchBranchResult | null>;

  abstract listLocalBranches?(layout: GitRepositoryLayout): Promise<string[]>;

  abstract createStandaloneWorktree(input: {
    layout: GitRepositoryLayout;
    worktreeId: string;
    branch: string;
    createBranch?: boolean;
    from?: string;
  }): Promise<{ contentRoot: string; branch: string; baseCommit: string }>;

  abstract removeStandaloneWorktree(layout: GitRepositoryLayout, worktreeId: string): Promise<void>;

  abstract deleteLocalBranch(layout: GitRepositoryLayout, branch: string): Promise<void>;

  abstract listCheckedOutBranches(
    layout: GitRepositoryLayout,
  ): Promise<Array<{ path: string; branch: string | null; head: string | null }>>;

  abstract observeWorktree(
    layout: GitRepositoryLayout,
    worktreeId: string,
  ): Promise<{ dirty: boolean; unpushed: boolean; branch: string | null; head: string | null }>;
}
