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
import { useDeskStore } from './desk.store';

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
  useDeskStore.setState({ hydrated: {} });
  queryClient.removeQueries({ queryKey: projectQueryKey });
  queryClient.removeQueries({ queryKey: orgAgentsQueryKey });
  queryClient.removeQueries({ queryKey: orgSummaryQueryKey });
  queryClient.removeQueries({ queryKey: orgAssignmentsQueryKey });
}
