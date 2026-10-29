import type { GithubIssueCommentRecord, GithubIssueRecord } from 'harnesys';
import { githubApiJson, isRecord, splitRepo, stringField } from './github-api.ts';
import type { FetchLike } from './installation-token.ts';

export async function listIssues(
  token: string,
  input: { repo: string; state?: string; limit?: number },
  fetchImpl: FetchLike = fetch,
): Promise<GithubIssueRecord[]> {
  const [owner, name] = splitRepo(input.repo);
  const perPage = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const items = await githubApiJson<unknown[]>(
    {
      token,
      method: 'GET',
      path: `/repos/${owner}/${name}/issues`,
      query: new URLSearchParams({ state: input.state ?? 'open', per_page: String(perPage) }),
    },
    fetchImpl,
  );
  return items
    .filter(isRecord)
    .filter((item) => !isRecord(item.pull_request))
    .map(issueOf);
}

export async function getIssue(
  token: string,
  input: { repo: string; number: number },
  fetchImpl: FetchLike = fetch,
): Promise<GithubIssueRecord> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<Record<string, unknown>>(
    { token, method: 'GET', path: `/repos/${owner}/${name}/issues/${input.number}` },
    fetchImpl,
  );
  return issueOf(raw);
}

export async function createIssue(
  token: string,
  input: { repo: string; title: string; body?: string; labels?: string[] },
  fetchImpl: FetchLike = fetch,
): Promise<GithubIssueRecord> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'POST',
      path: `/repos/${owner}/${name}/issues`,
      body: {
        title: input.title,
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.labels !== undefined ? { labels: input.labels } : {}),
      },
    },
    fetchImpl,
  );
  return issueOf(raw);
}

export async function createIssueComment(
  token: string,
  input: { repo: string; number: number; body: string },
  fetchImpl: FetchLike = fetch,
): Promise<GithubIssueCommentRecord> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'POST',
      path: `/repos/${owner}/${name}/issues/${input.number}/comments`,
      body: { body: input.body },
    },
    fetchImpl,
  );
  return {
    id: Number(raw.id ?? 0),
    body: stringField(raw, 'body') ?? '',
    author: userLoginOf(raw),
    htmlUrl: stringField(raw, 'html_url') ?? '',
    createdAt: stringField(raw, 'created_at'),
  };
}

export async function closeIssue(
  token: string,
  input: { repo: string; number: number },
  fetchImpl: FetchLike = fetch,
): Promise<GithubIssueRecord> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'PATCH',
      path: `/repos/${owner}/${name}/issues/${input.number}`,
      body: { state: 'closed' },
    },
    fetchImpl,
  );
  return issueOf(raw);
}

export async function addIssueLabels(
  token: string,
  input: { repo: string; number: number; labels: string[] },
  fetchImpl: FetchLike = fetch,
): Promise<string[]> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<unknown[]>(
    {
      token,
      method: 'POST',
      path: `/repos/${owner}/${name}/issues/${input.number}/labels`,
      body: { labels: input.labels },
    },
    fetchImpl,
  );
  return raw.filter(isRecord).map((label) => stringField(label, 'name') ?? '');
}

function issueOf(raw: Record<string, unknown>): GithubIssueRecord {
  return {
    id: Number(raw.id ?? 0),
    number: Number(raw.number ?? 0),
    title: stringField(raw, 'title') ?? '',
    state: stringField(raw, 'state') ?? '',
    body: stringField(raw, 'body') ?? '',
    labels: Array.isArray(raw.labels)
      ? raw.labels.filter(isRecord).map((label) => stringField(label, 'name') ?? '')
      : [],
    author: userLoginOf(raw),
    htmlUrl: stringField(raw, 'html_url') ?? '',
    comments: Number(raw.comments ?? 0),
    createdAt: stringField(raw, 'created_at'),
    updatedAt: stringField(raw, 'updated_at'),
  };
}

function userLoginOf(raw: Record<string, unknown>): string | null {
  return isRecord(raw.user) ? stringField(raw.user, 'login') : null;
}
