import type {
  GitBranch,
  GitCommitDetail,
  GitCommitSummary,
  GitDiffResponse,
  GitFileStatusResponse,
  GitStatusResponse,
} from './git-vcs.types.ts';

export interface VcsProbeRaw {
  isGit: boolean;
  defaultBranch: string | null;
  remoteUrl: string | null;
}

export interface GitMachineInfo {
  version: string | null;
  userName: string | null;
  userEmail: string | null;
}

export interface GitIdentity {
  userName: string;
  userEmail: string;
}

export abstract class GitVcsPort {
  abstract probe(cwd: string): Promise<VcsProbeRaw>;
  abstract getStatus(cwd: string): Promise<GitStatusResponse>;
  abstract getFileStatus(cwd: string, subPath?: string): Promise<GitFileStatusResponse>;
  abstract getDiff(cwd: string, filePath: string): Promise<GitDiffResponse>;
  abstract listBranches(cwd: string): Promise<{
    local: GitBranch[];
    recent: GitBranch[];
  }>;
  abstract checkout(cwd: string, branch: string): Promise<void>;
  abstract merge(cwd: string, branch: string): Promise<void>;
  abstract createBranch(cwd: string, name: string, checkout: boolean, from?: string): Promise<void>;
  abstract validateBranchName(cwd: string, name: string): Promise<boolean>;
  abstract stage(cwd: string, paths: string[]): Promise<void>;
  abstract unstage(cwd: string, paths: string[]): Promise<void>;
  abstract discard(cwd: string, paths: string[], untrackedPaths: string[]): Promise<void>;
  abstract commit(cwd: string, message: string, paths?: string[], amend?: boolean): Promise<void>;
  abstract log(cwd: string, limit: number): Promise<GitCommitSummary[]>;
  abstract show(cwd: string, sha: string): Promise<GitCommitDetail>;
  abstract revert(cwd: string, sha: string): Promise<void>;
  abstract getMachineInfo(): Promise<GitMachineInfo>;
  abstract setIdentity(identity: GitIdentity): Promise<GitMachineInfo>;
  abstract push(cwd: string): Promise<void>;
  abstract pull(cwd: string): Promise<void>;
  abstract fetch(cwd: string): Promise<void>;
  abstract init(cwd: string): Promise<void>;
  abstract setRemote(cwd: string, name: string, url: string): Promise<void>;
}
