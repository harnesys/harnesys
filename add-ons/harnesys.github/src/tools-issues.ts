import { type AddonContext, type ToolHandler } from '@harnesys/sdk';
import { githubJson } from './github-client.ts';
import {
  type GithubIssueCommentRecord,
  type GithubIssueRecord,
  isRecord,
  issueCommentOf,
  issueOf,
} from './github-mappers.ts';
import {
  accountOf,
  IssueCommentSchema,
  IssueCreateSchema,
  IssueListSchema,
  IssueRefSchema,
  LabelsSchema,
  limitOf,
  parseWith,
  repoPath,
} from './tools-input.ts';

const listIssues: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, state, limit, accountId } = parseWith('list_issues', IssueListSchema, input);
  const query = new URLSearchParams({
    state: state ?? 'open',
    per_page: String(limitOf(limit, 20, 50)),
  });
  const items = await githubJson<unknown[]>(ctx, {
    ...accountOf(accountId),
    path: repoPath(repo, '/issues'),
    query,
  });
  const issues = (Array.isArray(items) ? items : [])
    .filter(isRecord)
    .filter((item) => !isRecord(item.pull_request))
    .map(issueOf);
  return { issues } satisfies { issues: GithubIssueRecord[] };
};

const getIssue: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, accountId } = parseWith('get_issue', IssueRefSchema, input);
  const issue = issueOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      path: repoPath(repo, `/issues/${number}`),
    }),
  );
  return { issue } satisfies { issue: GithubIssueRecord };
};

const createIssue: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, title, body, labels, accountId } = parseWith(
    'create_issue',
    IssueCreateSchema,
    input,
  );
  const issue = issueOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      method: 'POST',
      path: repoPath(repo, '/issues'),
      body: {
        title,
        ...(body !== undefined ? { body } : {}),
        ...(labels !== undefined ? { labels } : {}),
      },
    }),
  );
  await ctx.log.info('github issue created', { repo, number: issue.number });
  return { issue } satisfies { issue: GithubIssueRecord };
};

const commentIssue: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, body, accountId } = parseWith('comment_issue', IssueCommentSchema, input);
  const comment = issueCommentOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      method: 'POST',
      path: repoPath(repo, `/issues/${number}/comments`),
      body: { body },
    }),
  );
  await ctx.log.info('github issue comment added', { repo, number, commentId: comment.id });
  return { comment } satisfies { comment: GithubIssueCommentRecord };
};

const closeIssue: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, accountId } = parseWith('close_issue', IssueRefSchema, input);
  const issue = issueOf(
    await githubJson<Record<string, unknown>>(ctx, {
      ...accountOf(accountId),
      method: 'PATCH',
      path: repoPath(repo, `/issues/${number}`),
      body: { state: 'closed' },
    }),
  );
  await ctx.log.info('github issue closed', { repo, number });
  return { issue } satisfies { issue: GithubIssueRecord };
};

const addLabels: ToolHandler = async (input, ctx: AddonContext) => {
  const { repo, number, labels, accountId } = parseWith('add_labels', LabelsSchema, input);
  const items = await githubJson<unknown[]>(ctx, {
    ...accountOf(accountId),
    method: 'POST',
    path: repoPath(repo, `/issues/${number}/labels`),
    body: { labels },
  });
  const applied = (Array.isArray(items) ? items : [])
    .filter(isRecord)
    .map((label) => (typeof label.name === 'string' ? label.name : ''))
    .filter((name) => name !== '');
  return { labels: applied } satisfies { labels: string[] };
};

export const issueTools: Record<string, ToolHandler> = {
  list_issues: listIssues,
  get_issue: getIssue,
  create_issue: createIssue,
  comment_issue: commentIssue,
  close_issue: closeIssue,
  add_labels: addLabels,
};
