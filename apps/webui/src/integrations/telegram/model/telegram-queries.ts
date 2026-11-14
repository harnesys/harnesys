import { queryOptions } from '@tanstack/react-query';
import { listSources } from '../api';

export function telegramSourcesQueryKey(orgId: string) {
  return ['integrations', 'telegram', 'sources', orgId] as const;
}

export function telegramSourcesQuery(orgId: string) {
  return queryOptions({
    queryKey: telegramSourcesQueryKey(orgId),
    queryFn: () => listSources(orgId),
    enabled: Boolean(orgId),
  });
}
