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

export interface GitFileStatusResponse {
  map: GitFileStatusMap;
  truncated: boolean;
  stagedPaths?: string[];
  unstagedPaths?: string[];
}

export interface GitCommitAuthor {
  name: string;
  email: string;
}

export interface GitCommitSummary {
  sha: string;
  shortSha: string;
  subject: string;
  author: GitCommitAuthor;
  date: string;
  refs: string[];
  parents: string[];
}

export interface GitCommitFileChange {
  path: string;
  previousPath?: string;
  added: number;
  deleted: number;
  status: GitFileStatus;
}

export interface GitCommitDetail {
  commit: GitCommitSummary;
  body: string;
  files: GitCommitFileChange[];
  patch: string;
  truncated: boolean;
}

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

export interface GitDiffResponse {
  path: string;
  status: GitFileStatus;
  original: string | null;
  current: string | null;
  diff: string | null;
  isBinary: boolean;
  truncated?: boolean;
}
