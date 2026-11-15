import { useQuery } from '@tanstack/react-query';
import { getActiveOrgId } from '@/shared/api/active-org';
import { addonViewersQuery } from '@/shared/api/addon-viewers';

function extensionOf(name: string): string {
  const base = name.replaceAll('\\', '/').split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

/**
 * Add-on icons declared for file extensions, keyed by dot-prefixed extension.
 * Extensions without a descriptor icon keep the built-in file icon.
 */
export function useAddonFileIcon(): (name: string) => string | undefined {
  const orgId = getActiveOrgId();
  const query = useQuery({ ...addonViewersQuery(orgId ?? ''), enabled: Boolean(orgId) });
  const byExtension = new Map<string, string>();
  for (const viewer of query.data?.viewers ?? []) {
    if (viewer.icon === undefined) {
      continue;
    }
    for (const extension of viewer.extensions) {
      byExtension.set(extension.toLowerCase(), viewer.icon);
    }
  }
  return (name: string) => {
    const extension = extensionOf(name);
    return extension === '' ? undefined : byExtension.get(extension);
  };
}
