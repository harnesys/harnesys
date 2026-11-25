import type { QueryClient } from '@tanstack/react-query';
import { useAgentStore } from '@/entities/agent';
import { useAutomationStore } from '@/entities/automation';
import { useIssueBoardStore, useIssueLabelStore, useIssueStore } from '@/entities/issue';
import { useThreadStore } from '@/entities/thread';
import {
  orgAgentsQueryKey,
  orgAssignmentsQueryKey,
  orgSummaryQueryKey,
  projectQueryKey,
} from '@/shared/api';

export function resetOrgState(nextOrgId: string, queryClient: QueryClient): void {
  if (!nextOrgId) {
    return;
  }
  useAgentStore.setState({ items: [] });
  useThreadStore.setState({ items: [] });
  useAutomationStore.setState({ items: [] });
  useIssueStore.setState({ items: [] });
  useIssueBoardStore.setState({ boards: [] });
  useIssueLabelStore.setState({ items: [] });
  queryClient.removeQueries({ queryKey: projectQueryKey });
  queryClient.removeQueries({ queryKey: orgAgentsQueryKey });
  queryClient.removeQueries({ queryKey: orgSummaryQueryKey });
  queryClient.removeQueries({ queryKey: orgAssignmentsQueryKey });
}
