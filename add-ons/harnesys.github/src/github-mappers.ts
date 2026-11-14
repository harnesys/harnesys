export interface GithubRepoSummary {
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string | null;
}

export interface GithubFileContent {
  path: string;
  size: number;
  content: string;
  encoding: string;
  sha: string;
  htmlUrl: string;
}

export interface GithubCodeSearchHit {
  path: string;
  repo: string;
  url: string;
  excerpt: string;
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
  labels: string[];
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

export function splitRepo(repo: string): [string, string] {
  const slash = repo.indexOf('/');
  if (slash <= 0 || slash === repo.length - 1) {
    throw new GithubRepoIdError(repo);
  }
  return [repo.slice(0, slash), repo.slice(slash + 1)];
}

export class GithubRepoIdError extends Error {
  constructor(repo: string) {
    super(`repo must be owner/name, got: ${repo}`);
    this.name = 'GithubRepoIdError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function numberField(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function loginOf(record: Record<string, unknown>, key: string): string | null {
  const inner = record[key];
  return isRecord(inner) ? stringField(inner, 'login') : null;
}

function labelsOf(record: Record<string, unknown>): string[] {
  if (!Array.isArray(record.labels)) {
    return [];
  }
  return record.labels
    .filter(isRecord)
    .map((label) => stringField(label, 'name') ?? '')
    .filter((name) => name !== '');
}

function refOf(record: Record<string, unknown>, key: string): string | null {
  const inner = record[key];
  return isRecord(inner) ? stringField(inner, 'ref') : null;
}

export function repoOf(raw: Record<string, unknown>): GithubRepoSummary {
  return {
    name: stringField(raw, 'name') ?? '',
    fullName: stringField(raw, 'full_name') ?? '',
    private: raw.private === true,
    defaultBranch: stringField(raw, 'default_branch') ?? 'main',
    updatedAt: stringField(raw, 'updated_at'),
  };
}

export function issueOf(raw: Record<string, unknown>): GithubIssueRecord {
  return {
    id: numberField(raw, 'id', 0),
    number: numberField(raw, 'number', 0),
    title: stringField(raw, 'title') ?? '',
    state: stringField(raw, 'state') ?? '',
    body: stringField(raw, 'body') ?? '',
    labels: labelsOf(raw),
    author: loginOf(raw, 'user'),
    htmlUrl: stringField(raw, 'html_url') ?? '',
    comments: numberField(raw, 'comments', 0),
    createdAt: stringField(raw, 'created_at'),
    updatedAt: stringField(raw, 'updated_at'),
  };
}

export function issueCommentOf(raw: Record<string, unknown>): GithubIssueCommentRecord {
  return {
    id: numberField(raw, 'id', 0),
    body: stringField(raw, 'body') ?? '',
    author: loginOf(raw, 'user'),
    htmlUrl: stringField(raw, 'html_url') ?? '',
    createdAt: stringField(raw, 'created_at'),
  };
}

export function pullRequestOf(raw: Record<string, unknown>): GithubPullRequestRecord {
  return {
    id: numberField(raw, 'id', 0),
    number: numberField(raw, 'number', 0),
    title: stringField(raw, 'title') ?? '',
    state: stringField(raw, 'state') ?? '',
    draft: raw.draft === true,
    body: stringField(raw, 'body') ?? '',
    labels: labelsOf(raw),
    author: loginOf(raw, 'user'),
    headRef: refOf(raw, 'head') ?? '',
    baseRef: refOf(raw, 'base') ?? '',
    htmlUrl: stringField(raw, 'html_url') ?? '',
    createdAt: stringField(raw, 'created_at'),
    updatedAt: stringField(raw, 'updated_at'),
  };
}

export function workflowRunOf(raw: Record<string, unknown>): GithubWorkflowRunRecord {
  return {
    id: numberField(raw, 'id', 0),
    name: stringField(raw, 'name'),
    headBranch: stringField(raw, 'head_branch'),
    status: stringField(raw, 'status') ?? '',
    conclusion: stringField(raw, 'conclusion'),
    event: stringField(raw, 'event') ?? '',
    htmlUrl: stringField(raw, 'html_url') ?? '',
    createdAt: stringField(raw, 'created_at'),
  };
}

export function workflowJobOf(raw: Record<string, unknown>): GithubWorkflowJobRecord {
  return {
    id: numberField(raw, 'id', 0),
    name: stringField(raw, 'name') ?? '',
    status: stringField(raw, 'status') ?? '',
    conclusion: stringField(raw, 'conclusion'),
    startedAt: stringField(raw, 'started_at'),
    completedAt: stringField(raw, 'completed_at'),
  };
}

export function codeSearchHitOf(raw: Record<string, unknown>): GithubCodeSearchHit {
  const repo = isRecord(raw.repository) ? raw.repository : {};
  return {
    path: stringField(raw, 'path') ?? '',
    repo: stringField(repo, 'full_name') ?? '',
    url: stringField(raw, 'html_url') ?? '',
    excerpt: stringField(raw, 'text_matches') === null ? '' : excerptOf(raw),
  };
}

function excerptOf(raw: Record<string, unknown>): string {
  const matches = raw.text_matches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return '';
  }
  const first = matches[0];
  if (!isRecord(first)) {
    return '';
  }
  return stringField(first, 'fragment') ?? '';
}
