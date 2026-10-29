import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOrgId } from '@/shared/config/location';
import { hydrateDeskChrome } from '../model/desk-chrome';
import { hydrateOrgDesk } from '../model/hydrate-desk';
import { resetOrgState } from '../model/org-reset';

export function OrgDeskSync() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!orgId) {
      return;
    }
    resetOrgState(orgId, queryClient);
    void hydrateDeskChrome(orgId);
    void hydrateOrgDesk(orgId).catch(() => {});
  }, [orgId, queryClient]);
  return null;
}
