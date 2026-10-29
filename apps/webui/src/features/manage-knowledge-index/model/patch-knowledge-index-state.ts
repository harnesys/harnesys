import type { KnowledgeIndexState } from '@harnesys/studio-shared';
import type { QueryClient } from '@tanstack/react-query';
import {
  knowledgeIndexStateQueryKey,
  knowledgeIndexStatesQueryKey,
} from '@/shared/api/knowledge-index';

export function patchKnowledgeIndexState(
  queryClient: QueryClient,
  orgId: string,
  sourceId: string,
  state: KnowledgeIndexState,
): void {
  queryClient.setQueryData(knowledgeIndexStateQueryKey(orgId, sourceId), state);
  queryClient.setQueryData(
    knowledgeIndexStatesQueryKey(orgId),
    (old: KnowledgeIndexState[] | undefined) => {
      if (!old) {
        return [state];
      }
      const idx = old.findIndex((row) => row.sourceId === sourceId);
      if (idx < 0) {
        return [...old, state];
      }
      const next = old.slice();
      next[idx] = state;
      return next;
    },
  );
}
