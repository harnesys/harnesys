import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { watchKnowledgeIndexState } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { patchKnowledgeIndexState } from '../model/patch-knowledge-index-state';

export function KnowledgeIndexSync() {
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const orgId = getActiveOrgId();
  useEffect(() => {
    if (!(orgId && projectId)) {
      return;
    }
    return watchKnowledgeIndexState(orgId, projectId, (state) => {
      patchKnowledgeIndexState(queryClient, orgId, projectId, state);
    });
  }, [orgId, projectId, queryClient]);
  return null;
}
