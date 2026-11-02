import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useActiveOrgStore } from '@/entities/org-machine';
import { useOrgId } from '@/shared/config/location';
import { deskTerminalsQuery } from './desk-queries';

function useOrgTerminalsQuery() {
  const routeOrgId = useOrgId();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  return useQuery(deskTerminalsQuery(routeOrgId ?? storeOrgId ?? ''));
}

export function useOrgTerminals(): TerminalSessionRecord[] {
  return useOrgTerminalsQuery().data ?? [];
}
