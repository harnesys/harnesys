import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { githubJson } from './github-client.ts';
import { type GithubRepoSummary, isRecord, repoOf } from './github-mappers.ts';
import { repoEventsTrigger } from './repo-events-trigger.ts';
import { repoEventsWorker } from './repo-events-worker.ts';
import { issueTools } from './tools-issues.ts';
import { prTools } from './tools-prs.ts';
import { repoTools } from './tools-repos.ts';

const ADDON_ID = 'harnesys.github';
const ADDON_VERSION = '1.0.0';

const repos: RouteHandler = async (_request, ctx: AddonContext) => {
  const wire = await githubJson<{ repositories: unknown[] }>(ctx, {
    path: '/installation/repositories',
    query: new URLSearchParams({ per_page: '100' }),
  });
  const rows = (Array.isArray(wire.repositories) ? wire.repositories : [])
    .filter(isRecord)
    .map(repoOf);
  return { status: 200, body: { rows } } satisfies {
    status: number;
    body: { rows: GithubRepoSummary[] };
  };
};

export const addon = defineAddon({
  tools: { ...repoTools, ...issueTools, ...prTools },
  triggers: { 'github.repo-events': repoEventsTrigger },
  workers: { 'repo-poller': repoEventsWorker },
  routes: { repos },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
