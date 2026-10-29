export type GitFileStatus =
  | 'modified'
  | 'staged'
  | 'added'
  | 'untracked'
  | 'conflicted'
  | 'ignored'
  | 'deleted'
  | 'renamed';
export type GitFileStatusMap = Record<string, GitFileStatus>;
export interface GitBranch {
  name: string;
  current: boolean;
}
export interface GitStatusCounts {
  added: number;
  modified: number;
  deleted: number;
  untracked: number;
  staged: number;
  conflicted: number;
  renamed: number;
}
export interface GitSummaryCounts {
  modified: number;
  staged: number;
  untracked: number;
  conflicted: number;
}
export interface GitSourceSummary {
  sourceId: string;
  isGit: boolean;
  branch?: string;
  head?: string;
  dirtyCount?: number;
  ahead?: number;
  behind?: number;
  noCommits?: boolean;
  truncated?: boolean;
  counts?: GitSummaryCounts;
  skipped?: 'not-materialized' | 'git-error';
  remote?: boolean;
}
export type GitStatusBase =
  | {
      isGit: false;
    }
  | {
      isGit: true;
      branch: string | null;
      detached: boolean;
      head: string | null;
      ahead: number;
      behind: number;
      dirty: boolean;
      dirtyCount: number;
      counts?: GitStatusCounts;
      noCommits: boolean;
      truncated?: boolean;
    };
export type GitStatusResponse = GitStatusBase & {
  gitVersion?: string | null;
  gitUser?: {
    name: string | null;
    email: string | null;
  } | null;
  remote?: string | null;
  branches?: {
    local: GitBranch[];
    recent: GitBranch[];
  };
};
export interface GitCheckoutRequest {
  branch: string;
}
export interface GitCreateBranchRequest {
  name: string;
  checkout?: boolean;
  from?: string;
}
export interface GitDiffResponse {
  path: string;
  status: GitFileStatus;
  original: string | null;
  current: string | null;
  diff: string | null;
  isBinary: boolean;
  truncated?: boolean;
}
