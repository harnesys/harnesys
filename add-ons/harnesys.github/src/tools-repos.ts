import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import { githubJson } from './github-client.ts';
import {
  codeSearchHitOf,
  type GithubFileContent,
  type GithubRepoSummary,
  type GithubWorkflowJobRecord,
  type GithubWorkflowRunRecord,
  isRecord,
  repoOf,
  stringField,
  workflowJobOf,
  workflowRunOf,
} from './github-mappers.ts';
import {
  AccountSchema,
  accountOf,
  FileSchema,
  limitOf,
  parseWith,
  RunRefSchema,
  RunsSchema,
  repoPath,
  SearchCodeSchema,
} from './tools-input.ts';

const MAX_FILE_BYTES = 512 * 1024;
const TEXT_MATCH_ACCEPT = 'application/vnd.github.text-match+json';

const listRepos: ToolHandler = async (input, ctx: AddonContext) => {
  const { accountId } = parseWith('list_repos', AccountSchema, input);
  const wire = await githubJson<{ repositories: unknown[] }>(ctx, {
    ...accountOf(accountId),
    path: '/installation/repositories',
    query: new URLSearchParams({ per_page: '100' }),
  });
  const repos = (Array.isArray(wire.repositories) ? wire.repositories : [])
    .filter(isRecord)
    .map(repoOf);
  return { repos } satisfies { repos: GithubRepoSummary[] };
};

const getFile: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, path, ref, accountId } = parseWith('get_file', FileSchema, input);
  const query = new URLSearchParams();
  if (ref !== undefined) {
    query.set('ref', ref);
  }
  const wire = await githubJson<Record<string, unknown>>(ctx, {
    ...accountOf(accountId),
    path: repoPath(repo, `/contents/${encodePath(path)}`),
    ...(query.size > 0 ? { query } : {}),
  });
  const size = typeof wire.size === 'number' ? wire.size : 0;
  if (size > MAX_FILE_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `file is ${size} bytes; only files up to ${MAX_FILE_BYTES} bytes are supported`,
    });
  }
  const encoding = stringField(wire, 'encoding') ?? '';
  if (encoding !== 'base64') {
    throw new AddonError('invalid_response', {
      detail: `GitHub returned encoding '${encoding}'; only base64 file content is supported`,
    });
  }
  const encoded = stringField(wire, 'content') ?? '';
  const content = encoded === '' ? '' : Buffer.from(encoded, 'base64').toString('utf8');
  return {
    path: stringField(wire, 'path') ?? path,
    size,
    content,
    encoding: 'utf8',
    sha: stringField(wire, 'sha') ?? '',
    htmlUrl: stringField(wire, 'html_url') ?? '',
  } satisfies GithubFileContent;
};

const searchCode: ToolHandler = async (input, ctx: AddonContext) => {
  const { query, repo, limit, accountId } = parseWith('search_code', SearchCodeSchema, input);
  const term = repo === undefined ? query : `${query} repo:${repo}`;
  const wire = await githubJson<{ items: unknown[] }>(ctx, {
    ...accountOf(accountId),
    accept: TEXT_MATCH_ACCEPT,
    path: '/search/code',
    query: new URLSearchParams({
      q: term,
      per_page: String(limitOf(limit, 20, 50)),
    }),
  });
  const hits = (Array.isArray(wire.items) ? wire.items : []).filter(isRecord).map(codeSearchHitOf);
  return { hits } satisfies { hits: ReturnType<typeof codeSearchHitOf>[] };
};

const listWorkflowRuns: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, branch, limit, accountId } = parseWith('list_workflow_runs', RunsSchema, input);
  const query = new URLSearchParams({ per_page: String(limitOf(limit, 10, 50)) });
  if (branch !== undefined) {
    query.set('branch', branch);
  }
  const wire = await githubJson<{ workflow_runs: unknown[] }>(ctx, {
    ...accountOf(accountId),
    path: repoPath(repo, '/actions/runs'),
    query,
  });
  const runs = (Array.isArray(wire.workflow_runs) ? wire.workflow_runs : [])
    .filter(isRecord)
    .map(workflowRunOf);
  return { runs } satisfies { runs: GithubWorkflowRunRecord[] };
};

const getWorkflowRun: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, runId, accountId } = parseWith('get_workflow_run', RunRefSchema, input);
  const run = workflowRunOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      path: repoPath(repo, `/actions/runs/${runId}`),
    }),
  );
  return { run } satisfies { run: GithubWorkflowRunRecord };
};

const listRunJobs: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, runId, accountId } = parseWith('list_run_jobs', RunRefSchema, input);
  const wire = await githubJson<{ jobs: unknown[] }>(ctx, {
    ...accountOf(accountId),
    path: repoPath(repo, `/actions/runs/${runId}/jobs`),
  });
  const jobs = (Array.isArray(wire.jobs) ? wire.jobs : []).filter(isRecord).map(workflowJobOf);
  return { jobs } satisfies { jobs: GithubWorkflowJobRecord[] };
};

const rerunWorkflowRun: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, runId, accountId } = parseWith('rerun_workflow_run', RunRefSchema, input);
  await githubJson<Record<string, unknown>>(ctx, {
    ...accountOf(accountId),
    method: 'POST',
    path: repoPath(repo, `/actions/runs/${runId}/rerun`),
  });
  await ctx.log.info('github workflow run re-triggered', { repo, runId });
  return { ok: true };
};

export const repoTools: Record<string, ToolHandler> = {
  list_repos: listRepos,
  get_file: getFile,
  search_code: searchCode,
  list_workflow_runs: listWorkflowRuns,
  get_workflow_run: getWorkflowRun,
  list_run_jobs: listRunJobs,
  rerun_workflow_run: rerunWorkflowRun,
};

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
