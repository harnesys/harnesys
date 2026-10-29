import type {
  GithubIssueCommentInput,
  GithubIssueCreateInput,
  GithubIssueLabelsInput,
  GithubIssueListInput,
} from '../../ports/github-repos.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { type CreateGithubToolsParams, runGithubTool } from './create-github-content-tools.ts';

interface IssueRefInput {
  repo: string;
  number: number;
}

const STATE_PROPERTY = {
  state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Default open' },
};

export function createGithubIssueTools(deps: CreateGithubToolsParams): ToolDefinition[] {
  return [
    tool('github_issues_list', {
      group: 'github',
      description: 'List issues of a repository (excludes pull requests).',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          ...STATE_PROPERTY,
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['repo'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubIssueListInput;
          const issues = await deps.github.listIssues(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { issues };
        }),
    }),
    tool('github_issues_get', {
      group: 'github',
      description: 'Read one issue by number, including body and labels.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          number: { type: 'integer' },
        },
        required: ['repo', 'number'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as IssueRefInput;
          const issue = await deps.github.getIssue(deps.resolveScope(), deps.integrationId, input);
          return { issue };
        }),
    }),
    tool('github_issues_create', {
      group: 'github',
      description: 'Create an issue in a repository.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          title: { type: 'string' },
          body: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['repo', 'title'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubIssueCreateInput;
          const issue = await deps.github.createIssue(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { issue };
        }),
    }),
    tool('github_issues_comment', {
      group: 'github',
      description: 'Add a comment to an issue or pull request.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          number: { type: 'integer' },
          body: { type: 'string' },
        },
        required: ['repo', 'number', 'body'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubIssueCommentInput;
          const comment = await deps.github.commentIssue(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { comment };
        }),
    }),
    tool('github_issues_close', {
      group: 'github',
      description: 'Close an issue by number.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          number: { type: 'integer' },
        },
        required: ['repo', 'number'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as IssueRefInput;
          const issue = await deps.github.closeIssue(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { issue };
        }),
    }),
    tool('github_issues_add_labels', {
      group: 'github',
      description: 'Add labels to an issue or pull request.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          number: { type: 'integer' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['repo', 'number', 'labels'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubIssueLabelsInput;
          const result = await deps.github.addIssueLabels(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { labels: result.labels };
        }),
    }),
  ];
}
