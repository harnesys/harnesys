import { queryOptions } from '@tanstack/react-query';
import { listReaders, listSources } from '../api';

export function telegramReadersQueryKey(orgId: string) {
  return ['integrations', 'telegram', 'readers', orgId] as const;
}

export function telegramSourcesQueryKey(orgId: string) {
  return ['integrations', 'telegram', 'sources', orgId] as const;
}

export function telegramReadersQuery(orgId: string) {
  return queryOptions({
    queryKey: telegramReadersQueryKey(orgId),
    queryFn: () => listReaders(orgId),
    enabled: Boolean(orgId),
  });
}

export function telegramSourcesQuery(orgId: string) {
  return queryOptions({
    queryKey: telegramSourcesQueryKey(orgId),
    queryFn: () => listSources(orgId),
    enabled: Boolean(orgId),
  });
}
