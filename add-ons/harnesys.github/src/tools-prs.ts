import { type AddonContext, type ToolHandler } from '@harnesys/sdk';
import { z } from 'zod';
import { githubJson, githubText } from './github-client.ts';
import {
  type GithubIssueCommentRecord,
  type GithubPullRequestRecord,
  isRecord,
  issueCommentOf,
  pullRequestOf,
} from './github-mappers.ts';
import {
  accountOf,
  IssueCommentSchema,
  IssueRefSchema,
  limitOf,
  PrCreateSchema,
  PrMergeSchema,
  PrReviewSchema,
  PrUpdateSchema,
  parseWith,
  repoPath,
} from './tools-input.ts';

const PrListSchema = IssueRefSchema.omit({ number: true }).extend({
  state: z.enum(['open', 'closed', 'all']).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const listPullRequests: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, state, limit, accountId } = parseWith('list_pull_requests', PrListSchema, input);
  const query = new URLSearchParams({
    state: state ?? 'open',
    per_page: String(limitOf(limit, 20, 50)),
  });
  const items = await githubJson<unknown[]>(ctx, {
    ...accountOf(accountId),
    path: repoPath(repo, '/pulls'),
    query,
  });
  const pulls = (Array.isArray(items) ? items : []).filter(isRecord).map(pullRequestOf);
  return { pulls } satisfies { pulls: GithubPullRequestRecord[] };
};

const getPullRequest: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, accountId } = parseWith('get_pull_request', IssueRefSchema, input);
  const pull = pullRequestOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      path: repoPath(repo, `/pulls/${number}`),
    }),
  );
  return { pull } satisfies { pull: GithubPullRequestRecord };
};

const getPullRequestDiff: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, accountId } = parseWith('get_pull_request_diff', IssueRefSchema, input);
  const diff = await githubText(ctx, {
    ...accountOf(accountId),
    path: repoPath(repo, `/pulls/${number}`),
  });
  return { diff } satisfies { diff: string };
};

const createPullRequest: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, head, base, title, body, draft, accountId } = parseWith(
    'create_pull_request',
    PrCreateSchema,
    input,
  );
  const pull = pullRequestOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      method: 'POST',
      path: repoPath(repo, '/pulls'),
      body: {
        title,
        head,
        ...(base !== undefined ? { base } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(draft === true ? { draft: true } : {}),
      },
    }),
  );
  await ctx.log.info('github pull request created', { repo, number: pull.number });
  return { pull } satisfies { pull: GithubPullRequestRecord };
};

const updatePullRequest: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, title, body, state, accountId } = parseWith(
    'update_pull_request',
    PrUpdateSchema,
    input,
  );
  const pull = pullRequestOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      method: 'PATCH',
      path: repoPath(repo, `/pulls/${number}`),
      body: {
        ...(title !== undefined ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(state !== undefined ? { state } : {}),
      },
    }),
  );
  await ctx.log.info('github pull request updated', { repo, number });
  return { pull } satisfies { pull: GithubPullRequestRecord };
};

const commentPullRequest: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, body, accountId } = parseWith(
    'comment_pull_request',
    IssueCommentSchema,
    input,
  );
  const comment = issueCommentOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      method: 'POST',
      path: repoPath(repo, `/issues/${number}/comments`),
      body: { body },
    }),
  );
  await ctx.log.info('github pull request comment added', { repo, number, commentId: comment.id });
  return { comment } satisfies { comment: GithubIssueCommentRecord };
};

const reviewPullRequest: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, event, body, accountId } = parseWith(
    'review_pull_request',
    PrReviewSchema,
    input,
  );
  await githubJson<Record<string, unknown>>(ctx, {
    ...accountOf(accountId),
    method: 'POST',
    path: repoPath(repo, `/pulls/${number}/reviews`),
    body: {
      event,
      ...(body !== undefined ? { body } : {}),
    },
  });
  await ctx.log.info('github pull request review submitted', { repo, number, event });
  return { ok: true };
};

const mergePullRequest: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, mergeMethod, accountId } = parseWith(
    'merge_pull_request',
    PrMergeSchema,
    input,
  );
  const raw = await githubJson<Record<string, unknown>>(ctx, {
    ...accountOf(accountId),
    method: 'PUT',
    path: repoPath(repo, `/pulls/${number}/merge`),
    body: {
      ...(mergeMethod !== undefined ? { merge_method: mergeMethod } : {}),
    },
  });
  await ctx.log.info('github pull request merged', { repo, number, merged: raw.merged === true });
  return {
    ok: true,
    merged: raw.merged === true,
    sha: typeof raw.sha === 'string' ? raw.sha : null,
  };
};

export const prTools: Record<string, ToolHandler> = {
  list_pull_requests: listPullRequests,
  get_pull_request: getPullRequest,
  get_pull_request_diff: getPullRequestDiff,
  create_pull_request: createPullRequest,
  update_pull_request: updatePullRequest,
  comment_pull_request: commentPullRequest,
  review_pull_request: reviewPullRequest,
  merge_pull_request: mergePullRequest,
};
