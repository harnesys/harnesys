import type { MachineOrgEntry } from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';

interface OrgSetupBackInput {
  from: string | null;
  activeOrgId: string | null;
  orgs: MachineOrgEntry[];
}

export function resolveOrgSetupBackPath({ from, activeOrgId, orgs }: OrgSetupBackInput): string {
  if (from) {
    return from;
  }
  if (activeOrgId && orgs.some((row) => row.orgId === activeOrgId)) {
    return studioPath.desk(activeOrgId);
  }
  const first = orgs[0]?.orgId;
  if (first) {
    return studioPath.desk(first);
  }
  return '/';
}

export function readOrgSetupFromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return null;
  }
  const from = state.from;
  return typeof from === 'string' && from.length > 0 ? from : null;
}
