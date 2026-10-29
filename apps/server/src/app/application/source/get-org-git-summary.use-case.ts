import { access } from 'node:fs/promises';
import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import type { GitStatusCounts, GitStatusResponse } from '../../domain/source/git-vcs.types.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import {
  type GitSourceSummary,
  type GitSummaryCounts,
  mergeSummaryResults,
} from './git-summary.util.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';

export interface GetOrgGitSummaryInput {
  orgId: string;
}

@Injectable()
export class GetOrgGitSummaryUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: GetOrgGitSummaryInput): Promise<GitSourceSummary[]> {
    const records = this.sources.list(input.orgId).filter((r) => hasGitVcs(r));
    const results = await Promise.all(
      records.map((record) => this.summarizeOne(input.orgId, record.id)),
    );
    return mergeSummaryResults(results);
  }

  private async summarizeOne(orgId: string, sourceId: string): Promise<GitSourceSummary> {
    let cwd: string;
    try {
      ({ cwd } = this.worktrees.resolve(orgId, sourceId));
    } catch {
      return { sourceId, isGit: false, skipped: 'git-error' };
    }
    const exists = await access(cwd).then(
      () => true,
      () => false,
    );
    if (!exists) {
      return { sourceId, isGit: false, skipped: 'not-materialized' };
    }
    try {
      const status = await this.git.getStatus(cwd);
      return toSourceSummary(sourceId, status);
    } catch {
      return { sourceId, isGit: false, skipped: 'git-error' };
    }
  }
}

function toSourceSummary(sourceId: string, status: GitStatusResponse): GitSourceSummary {
  if (!status.isGit) {
    return { sourceId, isGit: false };
  }
  const counts = toSummaryCounts(status.counts);
  return {
    sourceId,
    isGit: true,
    branch: status.branch ?? undefined,
    head: status.head ?? undefined,
    dirtyCount: status.dirtyCount,
    ahead: status.ahead,
    behind: status.behind,
    noCommits: status.noCommits || undefined,
    truncated: status.truncated || undefined,
    counts,
    remote: status.remote != null,
  };
}

function toSummaryCounts(counts: GitStatusCounts | undefined): GitSummaryCounts | undefined {
  if (!counts) {
    return undefined;
  }
  return {
    modified: counts.modified + counts.deleted,
    staged: counts.staged + counts.added + counts.renamed,
    untracked: counts.untracked,
    conflicted: counts.conflicted,
  };
}
