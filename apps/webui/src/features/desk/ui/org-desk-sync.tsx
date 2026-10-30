import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useOrgId } from '@/shared/config/location';
import { hydrateDeskChrome } from '../model/desk-chrome';
import { hydrateOrgDesk } from '../model/hydrate-desk';
import { resetOrgState } from '../model/org-reset';

export function OrgDeskSync() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const lastOrgRef = useRef<string | null>(null);
  useEffect(() => {
    if (!orgId) {
      return;
    }
    // Wipe stores only when the org actually changes; re-entering the same
    // org (remount after onboarding, layout remount) must keep hydrated data.
    if (lastOrgRef.current !== orgId) {
      resetOrgState(orgId, queryClient);
      lastOrgRef.current = orgId;
    }
    void hydrateDeskChrome(orgId);
    void hydrateOrgDesk(orgId).catch(() => {});
  }, [orgId, queryClient]);
  return null;
}
