import { getActiveOrgId } from './active-org';

export const projectQueryKey = ['projects'] as const;
export function resolveOrgId(_projectId: string): string {
  return getActiveOrgId() ?? '';
}
