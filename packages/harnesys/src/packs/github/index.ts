import { definePack } from '../../domain/pack.ts';
import type { GithubIntegrationResolution, GithubReposPort } from '../../ports/github-repos.ts';
import { createGithubContentTools } from './create-github-content-tools.ts';
import { createGithubIssueTools } from './create-github-issue-tools.ts';
import { createGithubPrAndCiTools } from './create-github-pr-tools.ts';

export interface GithubCapabilityPorts {
  github: GithubReposPort;
}

export interface GithubPackSpec {
  integrationId?: string;
}

const TOOL_META = [
  { name: 'github_list_repos', description: 'List repositories of the GitHub installation.' },
  { name: 'github_get_file', description: 'Fetch a file from a repository.' },
  { name: 'github_search_code', description: 'Search code across repositories.' },
  { name: 'github_issues_list', description: 'List repository issues.' },
  { name: 'github_issues_get', description: 'Read one issue.' },
  { name: 'github_issues_create', description: 'Create an issue.' },
  { name: 'github_issues_comment', description: 'Comment on an issue or pull request.' },
  { name: 'github_issues_close', description: 'Close an issue.' },
  { name: 'github_issues_add_labels', description: 'Add labels to an issue.' },
  { name: 'github_pr_list', description: 'List pull requests.' },
  { name: 'github_pr_get', description: 'Read one pull request.' },
  { name: 'github_pr_diff', description: 'Unified diff of a pull request.' },
  { name: 'github_pr_review', description: 'Submit a pull request review.' },
  { name: 'github_pr_create', description: 'Open a pull request from a pushed branch.' },
  { name: 'github_pr_update', description: 'Update pull request title, body, or state.' },
  { name: 'github_pr_merge', description: 'Merge a pull request.' },
  { name: 'github_ci_workflow_runs', description: 'Recent workflow runs.' },
  { name: 'github_ci_run_jobs', description: 'Jobs of a workflow run.' },
  { name: 'github_ci_rerun', description: 'Re-run a workflow run.' },
  { name: 'github_recent_events', description: 'Recent webhook events of the installation.' },
];

export const githubCapability = definePack<GithubCapabilityPorts, GithubPackSpec>({
  name: 'github',
  version: '1.0.0',
  description:
    'GitHub: repos and files, code search, issues, pull requests, CI runs, and webhook events of the connected installation',
  icon: 'github',
  specSchema: {
    type: 'object',
    properties: {
      integrationId: {
        type: 'string',
        description: 'Integration to use when several GitHub installations are connected',
      },
    },
    additionalProperties: false,
  },
  meta: {
    tools: TOOL_META,
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => {
    const pinned =
      typeof ctx.spec.integrationId === 'string' && ctx.spec.integrationId.trim() !== ''
        ? ctx.spec.integrationId.trim()
        : undefined;
    const resolution = ctx.ports.github.resolveIntegration(ctx.scope, pinned);
    if (resolution.status !== 'ready') {
      return { notes: () => [githubNote(resolution)] };
    }
    const deps = {
      github: ctx.ports.github,
      resolveScope: () => ctx.scope,
      integrationId: resolution.integrationId,
    };
    return {
      tools: [
        ...createGithubContentTools(deps),
        ...createGithubIssueTools(deps),
        ...createGithubPrAndCiTools(deps),
      ],
    };
  },
});

function githubNote(resolution: Exclude<GithubIntegrationResolution, { status: 'ready' }>): {
  tag: string;
  text: string;
} {
  const tag = 'github-connect';
  if (resolution.status === 'ambiguous') {
    return {
      tag,
      text:
        'Several GitHub installations are connected to this org. Set packs.github.spec.integrationId to pin one ' +
        '(ids are listed in Settings → Connectors); until then GitHub tools are unavailable.',
    };
  }
  if (resolution.status === 'not_found') {
    return {
      tag,
      text:
        'The GitHub installation pinned in packs.github.spec.integrationId no longer exists or is disconnected. ' +
        'Pick another id in Settings → Connectors; until then GitHub tools are unavailable.',
    };
  }
  return {
    tag,
    text: 'GitHub is not connected. Install the GitHub App in Settings → Connectors.',
  };
}
