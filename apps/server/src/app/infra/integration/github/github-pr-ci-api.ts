import type {
  GithubPullRequestRecord,
  GithubWorkflowJobRecord,
  GithubWorkflowRunRecord,
} from 'harnesys';
import { githubApiJson, githubApiText, isRecord, splitRepo, stringField } from './github-api.ts';
import type { FetchLike } from './installation-token.ts';

export async function listPullRequests(
  token: string,
  input: { repo: string; state?: string; limit?: number },
  fetchImpl: FetchLike = fetch,
): Promise<GithubPullRequestRecord[]> {
  const [owner, name] = splitRepo(input.repo);
  const perPage = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const items = await githubApiJson<unknown[]>(
    {
      token,
      method: 'GET',
      path: `/repos/${owner}/${name}/pulls`,
      query: new URLSearchParams({ state: input.state ?? 'open', per_page: String(perPage) }),
    },
    fetchImpl,
  );
  return items.filter(isRecord).map(pullRequestOf);
}

export async function getPullRequest(
  token: string,
  input: { repo: string; number: number },
  fetchImpl: FetchLike = fetch,
): Promise<GithubPullRequestRecord> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<Record<string, unknown>>(
    { token, method: 'GET', path: `/repos/${owner}/${name}/pulls/${input.number}` },
    fetchImpl,
  );
  return pullRequestOf(raw);
}

export async function getPullRequestDiff(
  token: string,
  input: { repo: string; number: number },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const [owner, name] = splitRepo(input.repo);
  return githubApiText(
    { token, method: 'GET', path: `/repos/${owner}/${name}/pulls/${input.number}` },
    fetchImpl,
  );
}

export async function createPullRequest(
  token: string,
  input: {
    repo: string;
    head: string;
    base?: string;
    title: string;
    body?: string;
    draft?: boolean;
  },
  fetchImpl: FetchLike = fetch,
): Promise<GithubPullRequestRecord> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'POST',
      path: `/repos/${owner}/${name}/pulls`,
      body: {
        title: input.title,
        head: input.head,
        ...(input.base !== undefined ? { base: input.base } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.draft === true ? { draft: true } : {}),
      },
    },
    fetchImpl,
  );
  return pullRequestOf(raw);
}

export async function updatePullRequest(
  token: string,
  input: {
    repo: string;
    number: number;
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
  },
  fetchImpl: FetchLike = fetch,
): Promise<GithubPullRequestRecord> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'PATCH',
      path: `/repos/${owner}/${name}/pulls/${input.number}`,
      body: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
      },
    },
    fetchImpl,
  );
  return pullRequestOf(raw);
}

export async function mergePullRequest(
  token: string,
  input: { repo: string; number: number; mergeMethod?: 'merge' | 'squash' | 'rebase' },
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: true; merged: boolean; sha: string | null }> {
  const [owner, name] = splitRepo(input.repo);
  const raw = await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'PUT',
      path: `/repos/${owner}/${name}/pulls/${input.number}/merge`,
      body: {
        ...(input.mergeMethod !== undefined ? { merge_method: input.mergeMethod } : {}),
      },
    },
    fetchImpl,
  );
  return {
    ok: true,
    merged: raw.merged === true,
    sha: typeof raw.sha === 'string' ? raw.sha : null,
  };
}

export async function createPullRequestReview(
  token: string,
  input: {
    repo: string;
    number: number;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    body?: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const [owner, name] = splitRepo(input.repo);
  await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'POST',
      path: `/repos/${owner}/${name}/pulls/${input.number}/reviews`,
      body: {
        event: input.event,
        ...(input.body !== undefined ? { body: input.body } : {}),
      },
    },
    fetchImpl,
  );
}

export async function listWorkflowRuns(
  token: string,
  input: { repo: string; limit?: number },
  fetchImpl: FetchLike = fetch,
): Promise<GithubWorkflowRunRecord[]> {
  const [owner, name] = splitRepo(input.repo);
  const perPage = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const res = await githubApiJson<{ workflow_runs: unknown[] }>(
    {
      token,
      method: 'GET',
      path: `/repos/${owner}/${name}/actions/runs`,
      query: new URLSearchParams({ per_page: String(perPage) }),
    },
    fetchImpl,
  );
  const items = Array.isArray(res.workflow_runs) ? res.workflow_runs : [];
  return items.filter(isRecord).map((run) => ({
    id: Number(run.id ?? 0),
    name: stringField(run, 'name'),
    headBranch: stringField(run, 'head_branch'),
    status: stringField(run, 'status') ?? '',
    conclusion: stringField(run, 'conclusion'),
    event: stringField(run, 'event') ?? '',
    htmlUrl: stringField(run, 'html_url') ?? '',
    createdAt: stringField(run, 'created_at'),
  }));
}

export async function listWorkflowRunJobs(
  token: string,
  input: { repo: string; runId: number },
  fetchImpl: FetchLike = fetch,
): Promise<GithubWorkflowJobRecord[]> {
  const [owner, name] = splitRepo(input.repo);
  const res = await githubApiJson<{ jobs: unknown[] }>(
    {
      token,
      method: 'GET',
      path: `/repos/${owner}/${name}/actions/runs/${input.runId}/jobs`,
    },
    fetchImpl,
  );
  const items = Array.isArray(res.jobs) ? res.jobs : [];
  return items.filter(isRecord).map((job) => ({
    id: Number(job.id ?? 0),
    name: stringField(job, 'name') ?? '',
    status: stringField(job, 'status') ?? '',
    conclusion: stringField(job, 'conclusion'),
    startedAt: stringField(job, 'started_at'),
    completedAt: stringField(job, 'completed_at'),
  }));
}

export async function rerunWorkflowRun(
  token: string,
  input: { repo: string; runId: number },
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const [owner, name] = splitRepo(input.repo);
  await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'POST',
      path: `/repos/${owner}/${name}/actions/runs/${input.runId}/rerun`,
    },
    fetchImpl,
  );
}

function pullRequestOf(raw: Record<string, unknown>): GithubPullRequestRecord {
  const head = isRecord(raw.head) ? raw.head : {};
  const base = isRecord(raw.base) ? raw.base : {};
  return {
    id: Number(raw.id ?? 0),
    number: Number(raw.number ?? 0),
    title: stringField(raw, 'title') ?? '',
    state: stringField(raw, 'state') ?? '',
    draft: raw.draft === true,
    body: stringField(raw, 'body') ?? '',
    author: isRecord(raw.user) ? stringField(raw.user, 'login') : null,
    headRef: stringField(head, 'ref') ?? '',
    baseRef: stringField(base, 'ref') ?? '',
    htmlUrl: stringField(raw, 'html_url') ?? '',
    createdAt: stringField(raw, 'created_at'),
    updatedAt: stringField(raw, 'updated_at'),
  };
}
