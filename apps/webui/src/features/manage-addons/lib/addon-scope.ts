import type { QueryClient } from '@tanstack/react-query';
import { addonsQueryKey } from '@/shared/api/addons';

/**
 * Invalidates every add-on query of one organization: the list, the detail and
 * its children (jobs, triggers, metrics, logs, sources of the same addon key).
 */
export function invalidateAddonScope(queryClient: QueryClient, orgId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: addonsQueryKey(orgId) });
}
