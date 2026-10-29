import type { GithubCodeSearchHit, GithubFileContent, GithubRepoSummary } from 'harnesys';
import { githubApiJson, isRecord, splitRepo, stringField } from './github-api.ts';
import type { FetchLike } from './installation-token.ts';

export async function listInstallationRepos(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<GithubRepoSummary[]> {
  const res = await githubApiJson<{ repositories: unknown[] }>(
    {
      token,
      method: 'GET',
      path: '/installation/repositories',
      query: new URLSearchParams({ per_page: '100' }),
    },
    fetchImpl,
  );
  const items = Array.isArray(res.repositories) ? res.repositories : [];
  return items.filter(isRecord).map((repo) => ({
    name: stringField(repo, 'name') ?? '',
    fullName: stringField(repo, 'full_name') ?? '',
    private: repo.private === true,
    defaultBranch: stringField(repo, 'default_branch') ?? 'main',
    updatedAt: stringField(repo, 'updated_at'),
  }));
}

export async function getRepoContent(
  token: string,
  input: { repo: string; path: string; ref?: string },
  fetchImpl: FetchLike = fetch,
): Promise<GithubFileContent> {
  const [owner, name] = splitRepo(input.repo);
  const query = new URLSearchParams(
    input.ref !== undefined && input.ref !== '' ? { ref: input.ref } : {},
  );
  const raw = await githubApiJson<Record<string, unknown>>(
    {
      token,
      method: 'GET',
      path: `/repos/${owner}/${name}/contents/${encodeEach(input.path)}`,
      query,
    },
    fetchImpl,
  );
  return {
    path: stringField(raw, 'path') ?? input.path,
    sha: stringField(raw, 'sha'),
    size: Number(raw.size ?? 0),
    encoding: stringField(raw, 'encoding') ?? 'none',
    content: stringField(raw, 'content') ?? '',
  };
}

export async function searchCode(
  token: string,
  input: { query: string; repo?: string; limit?: number },
  fetchImpl: FetchLike = fetch,
): Promise<GithubCodeSearchHit[]> {
  const qualifier = input.repo !== undefined ? ` repo:${input.repo}` : '';
  const perPage = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const res = await githubApiJson<{ items: unknown[] }>(
    {
      token,
      method: 'GET',
      path: '/search/code',
      query: new URLSearchParams({
        q: encodeURIComponent(`${input.query}${qualifier}`),
        per_page: String(perPage),
      }),
    },
    fetchImpl,
  );
  const items = Array.isArray(res.items) ? res.items : [];
  return items.filter(isRecord).map((item) => ({
    repo: stringField(isRecord(item.repository) ? item.repository : {}, 'full_name') ?? '',
    path: stringField(item, 'path') ?? '',
    textMatches: textMatchesOf(item),
  }));
}

function encodeEach(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function textMatchesOf(item: Record<string, unknown>): string[] {
  if (!Array.isArray(item.text_matches)) {
    return [];
  }
  return item.text_matches.filter(isRecord).map((match) => stringField(match, 'fragment') ?? '');
}
