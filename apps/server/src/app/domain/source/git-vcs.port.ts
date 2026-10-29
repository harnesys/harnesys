import type {
  GitBranch,
  GitDiffResponse,
  GitFileStatusMap,
  GitStatusResponse,
} from './git-vcs.types.ts';

export interface VcsProbeRaw {
  isGit: boolean;
  defaultBranch: string | null;
  remoteUrl: string | null;
}

export abstract class GitVcsPort {
  abstract probe(cwd: string): Promise<VcsProbeRaw>;
  abstract getStatus(cwd: string): Promise<GitStatusResponse>;
  abstract getFileStatus(
    cwd: string,
    subPath?: string,
  ): Promise<{
    map: GitFileStatusMap;
    truncated: boolean;
  }>;
  abstract getDiff(cwd: string, filePath: string): Promise<GitDiffResponse>;
  abstract listBranches(cwd: string): Promise<{
    local: GitBranch[];
    recent: GitBranch[];
  }>;
  abstract checkout(cwd: string, branch: string): Promise<void>;
  abstract createBranch(cwd: string, name: string, checkout: boolean, from?: string): Promise<void>;
  abstract validateBranchName(cwd: string, name: string): Promise<boolean>;
  abstract stage(cwd: string, paths: string[]): Promise<void>;
  abstract commit(cwd: string, message: string): Promise<void>;
  abstract push(cwd: string): Promise<void>;
  abstract pull(cwd: string): Promise<void>;
  abstract init(cwd: string): Promise<void>;
  abstract setRemote(cwd: string, name: string, url: string): Promise<void>;
}
