import { Injectable } from '@harnesys/brix';
import type {
  GitIdentity,
  GitMachineInfo,
  VcsProbeRaw,
} from '../../../../../domain/source/git-vcs.port.ts';
import { GitVcsPort } from '../../../../../domain/source/git-vcs.port.ts';
import type {
  GitBranch,
  GitCommitDetail,
  GitCommitSummary,
  GitDiffResponse,
  GitFileStatusMap,
  GitFileStatusResponse,
  GitStatusResponse,
} from '../../../../../domain/source/git-vcs.types.ts';
import { getAheadBehind } from './git-ahead-behind.ts';
import {
  checkoutBranch,
  createBranch,
  listBranches,
  mergeBranch,
  validateBranchName,
} from './git-branches.ts';
import { commitChanges, discardPaths, stagePaths, unstagePaths } from './git-changes.ts';
import { getDiff } from './git-diff.ts';
import { execGit, execGitTrim } from './git-exec.ts';
import { getLog, getShow, revertCommit } from './git-log.ts';
import { readMachineInfo, writeGlobalIdentity } from './git-machine.ts';
import { fetchRemote, pullRemote, pushRemote } from './git-remote.ts';
import { getFileStatus, getMtimeKey, getStatus } from './git-status.ts';

interface StatusCache {
  map: GitFileStatusMap;
  truncated: boolean;
  mtimeKey: string;
  ts: number;
  slowCount: number;
}

@Injectable()
export class GitCliAdapter extends GitVcsPort {
  private readonly statusCache = new Map<string, StatusCache>();
  private gitVersionCache: string | null | undefined = undefined;

  async probe(cwd: string): Promise<VcsProbeRaw> {
    const safeCwd = await this.resolveCwd(cwd);
    const inside = await execGitTrim(safeCwd, ['rev-parse', '--is-inside-work-tree']).catch(
      () => 'false',
    );
    if (inside !== 'true') {
      return { isGit: false, defaultBranch: null, remoteUrl: null };
    }
    const defaultBranch = await execGitTrim(safeCwd, ['symbolic-ref', '--short', 'HEAD']).catch(
      () => '',
    );
    const remoteUrl = await execGitTrim(safeCwd, ['config', '--get', 'remote.origin.url']).catch(
      () => '',
    );
    return {
      isGit: true,
      defaultBranch: defaultBranch || null,
      remoteUrl: remoteUrl || null,
    };
  }

  async getStatus(cwd: string): Promise<GitStatusResponse> {
    const safeCwd = await this.resolveCwd(cwd);
    return getStatus(
      safeCwd,
      (c) => getAheadBehind(c),
      () => this.getVersion(),
      (c) => this.listBranches(c),
    );
  }

  async getFileStatus(cwd: string, subPath?: string): Promise<GitFileStatusResponse> {
    const safeCwd = await this.resolveCwd(cwd);
    return getFileStatus(safeCwd, this.statusCache, (c) => getMtimeKey(c), subPath);
  }

  async listBranches(cwd: string): Promise<{
    local: GitBranch[];
    recent: GitBranch[];
  }> {
    const safeCwd = await this.resolveCwd(cwd);
    return listBranches(safeCwd);
  }

  async checkout(cwd: string, branch: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await checkoutBranch(safeCwd, branch);
    this.statusCache.clear();
  }

  async merge(cwd: string, branch: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await mergeBranch(safeCwd, branch);
    this.statusCache.clear();
  }

  async createBranch(cwd: string, name: string, checkout: boolean, from?: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await createBranch(safeCwd, name, checkout, from);
    this.statusCache.clear();
  }

  async stage(cwd: string, paths: string[]): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await stagePaths(safeCwd, paths);
    this.statusCache.clear();
  }

  async unstage(cwd: string, paths: string[]): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await unstagePaths(safeCwd, paths);
    this.statusCache.clear();
  }

  async discard(cwd: string, paths: string[], untrackedPaths: string[]): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await discardPaths(safeCwd, paths, untrackedPaths);
    this.statusCache.clear();
  }

  async commit(cwd: string, message: string, paths?: string[], amend?: boolean): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await commitChanges(safeCwd, message, paths, amend);
    this.statusCache.clear();
  }

  async log(cwd: string, limit: number): Promise<GitCommitSummary[]> {
    const safeCwd = await this.resolveCwd(cwd);
    return getLog(safeCwd, limit);
  }

  async show(cwd: string, sha: string): Promise<GitCommitDetail> {
    const safeCwd = await this.resolveCwd(cwd);
    return getShow(safeCwd, sha);
  }

  async revert(cwd: string, sha: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await revertCommit(safeCwd, sha);
    this.statusCache.clear();
  }

  async getMachineInfo(): Promise<GitMachineInfo> {
    return readMachineInfo(() => this.getVersion());
  }

  async setIdentity(identity: GitIdentity): Promise<GitMachineInfo> {
    await writeGlobalIdentity(identity);
    return this.getMachineInfo();
  }

  async push(cwd: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await pushRemote(safeCwd);
    this.statusCache.clear();
  }

  async pull(cwd: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await pullRemote(safeCwd);
    this.statusCache.clear();
  }

  async fetch(cwd: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    await fetchRemote(safeCwd);
    this.statusCache.clear();
  }

  async init(cwd: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    const existing = await getStatus(
      safeCwd,
      (c) => getAheadBehind(c),
      () => this.getVersion(),
      (c) => this.listBranches(c),
    );
    if (existing.isGit) {
      return;
    }
    const res = await execGit(safeCwd, ['init']);
    if (res.code !== 0) {
      const err = (res.stderr + res.stdout).trim();
      throw new Error(err || `git init failed (${res.code})`);
    }
    this.statusCache.clear();
  }

  async setRemote(cwd: string, name: string, url: string): Promise<void> {
    const safeCwd = await this.resolveCwd(cwd);
    const added = await execGit(safeCwd, ['remote', 'add', name, url]);
    if (added.code !== 0) {
      const updated = await execGit(safeCwd, ['remote', 'set-url', name, url]);
      if (updated.code !== 0) {
        throw new Error((updated.stderr + updated.stdout).trim() || 'git remote set-url failed');
      }
    }
  }

  async getDiff(cwd: string, filePath: string): Promise<GitDiffResponse> {
    const safeCwd = await this.resolveCwd(cwd);
    return getDiff(safeCwd, filePath);
  }

  async validateBranchName(cwd: string, name: string): Promise<boolean> {
    const safeCwd = await this.resolveCwd(cwd);
    return validateBranchName(safeCwd, name);
  }

  private async getVersion(): Promise<string | null> {
    if (this.gitVersionCache !== undefined) {
      return this.gitVersionCache;
    }
    try {
      const out = await execGitTrim(process.cwd(), ['--version']);
      this.gitVersionCache = out || null;
      return this.gitVersionCache;
    } catch {
      this.gitVersionCache = null;
      return null;
    }
  }

  private resolveCwd(cwd: string): Promise<string> {
    if (cwd.includes('\0')) {
      return Promise.reject(new Error('invalid cwd'));
    }
    return Promise.resolve(cwd);
  }
}
