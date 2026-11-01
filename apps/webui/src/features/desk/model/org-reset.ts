import type { QueryClient } from '@tanstack/react-query';
import { useAgentStore } from '@/entities/agent';
import { useIssueBoardStore, useIssueLabelStore, useIssueStore } from '@/entities/issue';
import { useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import {
  orgAgentsQueryKey,
  orgAssignmentsQueryKey,
  orgSummaryQueryKey,
  projectQueryKey,
} from '@/shared/api';
import { DESK_QUERY_KEY } from './desk-queries';

export function resetOrgState(nextOrgId: string, queryClient: QueryClient): void {
  if (!nextOrgId) {
    return;
  }
  useAgentStore.setState({ items: [] });
  useThreadStore.setState({ items: [] });
  useScheduleStore.setState({ items: [] });
  useWebhookStore.setState({ items: [] });
  useIssueStore.setState({ items: [] });
  useIssueBoardStore.setState({ boards: [] });
  useIssueLabelStore.setState({ items: [] });
  // Invalidate (not remove): remove would cancel in-flight desk fetches on first mount and refetch them.
  void queryClient.invalidateQueries({ queryKey: DESK_QUERY_KEY });
  queryClient.removeQueries({ queryKey: projectQueryKey });
  queryClient.removeQueries({ queryKey: orgAgentsQueryKey });
  queryClient.removeQueries({ queryKey: orgSummaryQueryKey });
  queryClient.removeQueries({ queryKey: orgAssignmentsQueryKey });
}
