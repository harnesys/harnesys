import { queryOptions } from '@tanstack/react-query';
import { listSources, type Source } from '@/shared/api/sources';

export function orgSourcesQueryKey(orgId: string) {
  return ['sources', orgId] as const;
}

export function orgSourcesQuery(orgId: string) {
  return queryOptions({
    queryKey: orgSourcesQueryKey(orgId),
    queryFn: () => listSources(orgId),
    enabled: Boolean(orgId),
  });
}

export function integrationDriveSources(sources: Source[], integrationId: string): Source[] {
  return sources.filter(
    (source) =>
      source.distribution.kind === 'cloud-drive' &&
      source.distribution.integrationId === integrationId,
  );
}

export function driveSourceCount(sources: Source[], integrationId: string): number {
  return integrationDriveSources(sources, integrationId).length;
}
