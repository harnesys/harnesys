import type {
  GithubPrCreateInput,
  GithubPrListInput,
  GithubPrMergeInput,
  GithubPrReviewInput,
  GithubPrUpdateInput,
  GithubWorkflowRunsInput,
} from '../../ports/github-repos.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { type CreateGithubToolsParams, runGithubTool } from './create-github-content-tools.ts';

interface PrRefInput {
  repo: string;
  number: number;
}

interface RunRefInput {
  repo: string;
  runId: number;
}

const STATE_PROPERTY = {
  state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Default open' },
};

export function createGithubPrAndCiTools(deps: CreateGithubToolsParams): ToolDefinition[] {
  return [
    tool('github_pr_list', {
      group: 'github',
      description: 'List pull requests of a repository.',
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
          const input = raw as GithubPrListInput;
          const pulls = await deps.github.listPullRequests(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { pulls };
        }),
    }),
    tool('github_pr_get', {
      group: 'github',
      description: 'Read one pull request: title, state, head/base refs, body.',
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
          const input = raw as PrRefInput;
          const pull = await deps.github.getPullRequest(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { pull };
        }),
    }),
    tool('github_pr_diff', {
      group: 'github',
      description: 'Unified diff of a pull request.',
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
          const input = raw as PrRefInput;
          const diff = await deps.github.getPullRequestDiff(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { diff };
        }),
    }),
    tool('github_pr_review', {
      group: 'github',
      description:
        'Submit a pull request review: APPROVE, REQUEST_CHANGES, or COMMENT with an optional body.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          number: { type: 'integer' },
          event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] },
          body: { type: 'string', description: 'Review comment text' },
        },
        required: ['repo', 'number', 'event'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubPrReviewInput;
          await deps.github.reviewPullRequest(deps.resolveScope(), deps.integrationId, input);
          return { ok: true as const, number: input.number };
        }),
    }),
    tool('github_pr_create', {
      group: 'github',
      description: 'Open a pull request from a pushed branch.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          head: { type: 'string', description: 'Branch that contains the changes' },
          base: { type: 'string', description: 'Base branch; default is the repository default' },
          title: { type: 'string' },
          body: { type: 'string', description: 'Pull request description (markdown)' },
          draft: { type: 'boolean', description: 'Create as draft, default false' },
        },
        required: ['repo', 'head', 'title'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubPrCreateInput;
          const pull = await deps.github.createPullRequest(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { pull };
        }),
    }),
    tool('github_pr_update', {
      group: 'github',
      description: 'Update a pull request: title, description, or state (close/reopen).',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          number: { type: 'integer' },
          title: { type: 'string' },
          body: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed'] },
        },
        required: ['repo', 'number'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubPrUpdateInput;
          const pull = await deps.github.updatePullRequest(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { pull };
        }),
    }),
    tool('github_pr_merge', {
      group: 'github',
      description: 'Merge a pull request.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          number: { type: 'integer' },
          mergeMethod: {
            type: 'string',
            enum: ['merge', 'squash', 'rebase'],
            description: 'Default merge',
          },
        },
        required: ['repo', 'number'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubPrMergeInput;
          const result = await deps.github.mergePullRequest(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { merged: result.merged, sha: result.sha, number: input.number };
        }),
    }),
    tool('github_ci_workflow_runs', {
      group: 'github',
      description: 'Recent GitHub Actions workflow runs of a repository.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 10' },
        },
        required: ['repo'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubWorkflowRunsInput;
          const runs = await deps.github.listWorkflowRuns(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { runs };
        }),
    }),
    tool('github_ci_run_jobs', {
      group: 'github',
      description: 'Jobs of one workflow run with status and conclusion.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          runId: { type: 'integer' },
        },
        required: ['repo', 'runId'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as RunRefInput;
          const jobs = await deps.github.listWorkflowRunJobs(
            deps.resolveScope(),
            deps.integrationId,
            input,
          );
          return { jobs };
        }),
    }),
    tool('github_ci_rerun', {
      group: 'github',
      description: 'Re-run a workflow run.',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: '"owner/name"' },
          runId: { type: 'integer' },
        },
        required: ['repo', 'runId'],
      },
      sideEffect: 'credentialed',
      operations: ['github.write'],
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as RunRefInput;
          await deps.github.rerunWorkflowRun(deps.resolveScope(), deps.integrationId, input);
          return { ok: true as const, runId: input.runId };
        }),
    }),
  ];
}
