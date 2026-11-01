import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toClientAgentFromPublic, useAgentStore } from '@/entities/agent';
import { useIdeStore } from '@/features/ide/model/ide.store';
import { workspaceFromPersisted } from '@/features/ide/model/ide-persist';
import { orgScopedAgentsQuery } from '@/shared/api';
import { useOrgId } from '@/shared/config/location';
import { hydrateDeskChrome } from '../model/desk-chrome';
import { hydrateOrgDesk } from '../model/hydrate-desk';
import { resetOrgState } from '../model/org-reset';

export function OrgDeskSync() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const lastOrgRef = useRef<string | null>(null);
  const orgAgents = useQuery(orgScopedAgentsQuery(orgId));
  useEffect(() => {
    if (!orgId || !orgAgents.data) {
      return;
    }
    // Query-owned feed into the store (same shape as the hydrate slice): the
    // sidebar must recover even if the hydrate-path store write is lost.
    useAgentStore
      .getState()
      .replaceOrg(
        orgId,
        orgAgents.data.items
          .filter((item) => item.status !== 'archived')
          .map(toClientAgentFromPublic),
      );
  }, [orgId, orgAgents.data]);
  useEffect(() => {
    if (!orgId) {
      return;
    }
    // Wipe stores only when the org actually changes; re-entering the same
    // org (remount after onboarding, layout remount) must keep hydrated data.
    if (lastOrgRef.current !== orgId) {
      resetOrgState(orgId, queryClient);
      useIdeStore.setState({ workspace: workspaceFromPersisted(null) });
      lastOrgRef.current = orgId;
    }
    void hydrateDeskChrome(orgId);
    void hydrateOrgDesk(orgId).catch(() => {});
  }, [orgId, queryClient]);
  return null;
}
