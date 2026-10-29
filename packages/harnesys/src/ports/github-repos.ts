import type { CapabilityScope } from '../domain/pack.ts';

export type GithubIntegrationResolutionStatus =
  | 'ready'
  | 'not_connected'
  | 'ambiguous'
  | 'not_found';

export type GithubIntegrationResolution =
  | { status: 'ready'; integrationId: string }
  | { status: 'not_connected' }
  | { status: 'ambiguous' }
  | { status: 'not_found' };

export interface GithubRepoSummary {
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string | null;
}

export interface GithubFileContent {
  path: string;
  sha: string | null;
  size: number;
  encoding: string;
  content: string;
}

export interface GithubCodeSearchHit {
  repo: string;
  path: string;
  textMatches: string[];
}

export interface GithubIssueRecord {
  id: number;
  number: number;
  title: string;
  state: string;
  body: string;
  labels: string[];
  author: string | null;
  htmlUrl: string;
  comments: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface GithubIssueCommentRecord {
  id: number;
  body: string;
  author: string | null;
  htmlUrl: string;
  createdAt: string | null;
}

export interface GithubPullRequestRecord {
  id: number;
  number: number;
  title: string;
  state: string;
  draft: boolean;
  body: string;
  author: string | null;
  headRef: string;
  baseRef: string;
  htmlUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface GithubWorkflowRunRecord {
  id: number;
  name: string | null;
  headBranch: string | null;
  status: string;
  conclusion: string | null;
  event: string;
  htmlUrl: string;
  createdAt: string | null;
}

export interface GithubWorkflowJobRecord {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GithubEventRecord {
  deliveryId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface GithubFileInput {
  repo: string;
  path: string;
  ref?: string;
}

export interface GithubSearchCodeInput {
  query: string;
  repo?: string;
  limit?: number;
}

export interface GithubIssueListInput {
  repo: string;
  state?: 'open' | 'closed' | 'all';
  limit?: number;
}

export interface GithubIssueCreateInput {
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
}

export interface GithubIssueCommentInput {
  repo: string;
  number: number;
  body: string;
}

export interface GithubIssueLabelsInput {
  repo: string;
  number: number;
  labels: string[];
}

export interface GithubPrListInput {
  repo: string;
  state?: 'open' | 'closed' | 'all';
  limit?: number;
}

export interface GithubPrReviewInput {
  repo: string;
  number: number;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body?: string;
}

export interface GithubPrCreateInput {
  repo: string;
  head: string;
  base?: string;
  title: string;
  body?: string;
  draft?: boolean;
}

export interface GithubPrUpdateInput {
  repo: string;
  number: number;
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
}

export interface GithubPrMergeInput {
  repo: string;
  number: number;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}

export interface GithubWorkflowRunsInput {
  repo: string;
  limit?: number;
}

export interface GithubReposPort {
  resolveIntegration(
    scope: CapabilityScope,
    pinnedIntegrationId?: string,
  ): GithubIntegrationResolution;
  listRepos(scope: CapabilityScope, integrationId: string): Promise<GithubRepoSummary[]>;
  getFile(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubFileInput,
  ): Promise<GithubFileContent>;
  searchCode(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubSearchCodeInput,
  ): Promise<GithubCodeSearchHit[]>;
  listIssues(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubIssueListInput,
  ): Promise<GithubIssueRecord[]>;
  getIssue(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; number: number },
  ): Promise<GithubIssueRecord>;
  createIssue(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubIssueCreateInput,
  ): Promise<GithubIssueRecord>;
  commentIssue(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubIssueCommentInput,
  ): Promise<GithubIssueCommentRecord>;
  closeIssue(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; number: number },
  ): Promise<GithubIssueRecord>;
  addIssueLabels(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubIssueLabelsInput,
  ): Promise<{ labels: string[] }>;
  listPullRequests(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrListInput,
  ): Promise<GithubPullRequestRecord[]>;
  getPullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; number: number },
  ): Promise<GithubPullRequestRecord>;
  getPullRequestDiff(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; number: number },
  ): Promise<string>;
  reviewPullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrReviewInput,
  ): Promise<{ ok: true }>;
  createPullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrCreateInput,
  ): Promise<GithubPullRequestRecord>;
  updatePullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrUpdateInput,
  ): Promise<GithubPullRequestRecord>;
  mergePullRequest(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubPrMergeInput,
  ): Promise<{ ok: true; merged: boolean; sha: string | null }>;
  listWorkflowRuns(
    scope: CapabilityScope,
    integrationId: string,
    input: GithubWorkflowRunsInput,
  ): Promise<GithubWorkflowRunRecord[]>;
  listWorkflowRunJobs(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; runId: number },
  ): Promise<GithubWorkflowJobRecord[]>;
  rerunWorkflowRun(
    scope: CapabilityScope,
    integrationId: string,
    input: { repo: string; runId: number },
  ): Promise<{ ok: true }>;
  recentEvents(
    scope: CapabilityScope,
    integrationId: string,
    limit?: number,
  ): Promise<GithubEventRecord[]>;
}
