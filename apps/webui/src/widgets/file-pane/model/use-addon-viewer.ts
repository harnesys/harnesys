import { useQuery } from '@tanstack/react-query';
import { type AddonViewerView, addonViewersQuery } from '@/shared/api/addon-viewers';

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

export function useAddonViewer(
  orgId: string | null | undefined,
  path: string,
): AddonViewerView | undefined {
  const extension = extensionOf(path);
  const viewersQuery = useQuery({
    ...addonViewersQuery(orgId ?? ''),
    enabled: Boolean(orgId) && extension !== '',
  });
  if (!orgId || extension === '') {
    return undefined;
  }
  return viewersQuery.data?.viewers.find((entry) => entry.extensions.includes(extension));
}
