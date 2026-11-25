import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useIdeStore } from '@/features/ide/model/ide.store';
import { workspaceFromPersisted } from '@/features/ide/model/ide-persist';
import { useOrgId } from '@/shared/config/location';
import { hydrateDeskChrome } from '../model/desk-chrome';
import { useDeskStoreSync } from '../model/desk-store-sync';
import { resetOrgState } from '../model/org-reset';

let syncedOrgId: string | null = null;

export function OrgDeskSync() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  useDeskStoreSync(orgId, { orgEntities: true });
  useEffect(() => {
    if (!orgId) {
      return;
    }
    const switched = syncedOrgId !== null && syncedOrgId !== orgId;
    syncedOrgId = orgId;
    if (switched) {
      resetOrgState(orgId, queryClient);
      useIdeStore.setState({ workspace: workspaceFromPersisted(null) });
    }
    void hydrateDeskChrome(orgId);
  }, [orgId, queryClient]);
  return null;
}
