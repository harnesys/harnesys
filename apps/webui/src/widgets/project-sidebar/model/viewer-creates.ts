import { useQuery } from '@tanstack/react-query';
import { getActiveOrgId } from '@/shared/api/active-org';
import { addonViewersQuery } from '@/shared/api/addon-viewers';
import { fetchAddonRoute } from '@/shared/api/addons';
import type { ViewerCreateTemplate } from './explorer-draft.store';

export function useViewerCreates(): readonly ViewerCreateTemplate[] {
  const orgId = getActiveOrgId();
  const query = useQuery({ ...addonViewersQuery(orgId ?? ''), enabled: Boolean(orgId) });
  return (query.data?.viewers ?? [])
    .filter((viewer) => viewer.create && viewer.extensions.length > 0)
    .map((viewer) => ({
      addonId: viewer.addonId,
      viewerId: viewer.id,
      extension: viewer.extensions[0] ?? '',
      title: viewer.title,
    }));
}

export async function fetchViewerTemplate(template: ViewerCreateTemplate): Promise<string> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new Error('No active organization');
  }
  const result: unknown = await fetchAddonRoute(orgId, template.addonId, '/template');
  if (typeof result === 'object' && result !== null) {
    const content = (result as { content?: unknown }).content;
    if (typeof content === 'string') {
      return content;
    }
  }
  throw new Error('Addon template route returned no content');
}
