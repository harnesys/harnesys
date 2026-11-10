import type { AddonGrantEntry, AddonPermissionView } from '@harnesys/contracts';

export function grantsFromBody(
  declared: AddonPermissionView[],
  selectedIds: Set<string>,
): AddonGrantEntry[] {
  const grants: AddonGrantEntry[] = [];
  for (const permission of declared) {
    const mandatory = !permission.optional;
    if (!mandatory && !selectedIds.has(permission.id)) {
      continue;
    }
    grants.push({
      id: permission.id,
      scope: permission.effectiveScope ?? permission.scope,
    });
  }
  return grants;
}

export function grantedIdsOf(grants: AddonGrantEntry[]): Set<string> {
  return new Set(grants.map((entry) => entry.id));
}
