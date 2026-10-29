import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  GithubFileInput,
  GithubReposPort,
  GithubSearchCodeInput,
} from '../../ports/github-repos.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export interface CreateGithubToolsParams {
  github: GithubReposPort;
  resolveScope: () => CapabilityScope;
  integrationId: string;
}

export async function runGithubTool<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function createGithubContentTools(deps: CreateGithubToolsParams): ToolDefinition[] {
  return [
    tool('github_list_repos', {
      group: 'github',
      description:
        'List repositories of the connected GitHub App installation (name, fullName, private, defaultBranch, updatedAt).',
      input: { type: 'object', properties: {} },
      sideEffect: 'read',
      execute: async () =>
        runGithubTool(async () => ({
          repos: await deps.github.listRepos(deps.resolveScope(), deps.integrationId),
        })),
    }),
    tool('github_get_file', {
      group: 'github',
      description:
        'Fetch a file from a GitHub repository (base64 content plus metadata). repo is "owner/name".',
      input: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository as "owner/name"' },
          path: { type: 'string', description: 'File path inside the repository' },
          ref: {
            type: 'string',
            description: 'Branch, tag, or commit; defaults to default branch',
          },
        },
        required: ['repo', 'path'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubFileInput;
          const file = await deps.github.getFile(deps.resolveScope(), deps.integrationId, input);
          return { file };
        }),
    }),
    tool('github_search_code', {
      group: 'github',
      description: 'Search code across the installation repositories (GitHub code search syntax).',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Code search query' },
          repo: { type: 'string', description: 'Limit to "owner/name"' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['query'],
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = raw as GithubSearchCodeInput;
          const hits = await deps.github.searchCode(deps.resolveScope(), deps.integrationId, input);
          return { hits };
        }),
    }),
    tool('github_recent_events', {
      group: 'github',
      description:
        'Recent webhook events (push, issues, pull_request, workflow_run) delivered for this installation.',
      input: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 20' },
        },
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGithubTool(async () => {
          const input = (raw ?? {}) as { limit?: number };
          const events = await deps.github.recentEvents(
            deps.resolveScope(),
            deps.integrationId,
            input.limit,
          );
          return { events };
        }),
    }),
  ];
}
