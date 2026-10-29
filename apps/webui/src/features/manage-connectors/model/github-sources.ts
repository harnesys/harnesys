import type { Source } from '@/shared/api/sources';

export function integrationGitSources(sources: Source[], integrationId: string): Source[] {
  return sources.filter((source) => source.vcs?.integrationId === integrationId);
}

export function gitSourceCount(sources: Source[], integrationId: string): number {
  return integrationGitSources(sources, integrationId).length;
}
