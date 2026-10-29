import type { RunSourceRef } from './compose-run-skills.ts';
import type { OrgRuntimeDeps } from './org-runtime.types.ts';

export function resolveRunSourceRefs(deps: OrgRuntimeDeps, sourceIds: string[]): RunSourceRef[] {
  const localHostId = deps.machineConfig.get().id;
  const out: RunSourceRef[] = [];
  for (const id of sourceIds) {
    const source = deps.sources.findById(deps.orgId, id);
    if (!source) {
      continue;
    }
    try {
      const location = deps.sourceLocation.resolve({
        orgId: deps.orgId,
        sourceId: id,
        hostId: localHostId,
      });
      out.push({ id: source.id, name: source.name, root: location.absoluteRoot });
    } catch {
      // skip unresolved source roots
    }
  }
  return out;
}
