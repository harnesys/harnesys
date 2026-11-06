import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toClientAgentFromPublic, useAgentStore } from '@/entities/agent';
import { toClientAutomation, useAutomationStore } from '@/entities/automation';
import { useIssueBoardStore, useIssueLabelStore, useIssueStore } from '@/entities/issue';
import { toClientSchedule, useScheduleStore } from '@/entities/schedule';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { toClientWebhook, useWebhookStore } from '@/entities/webhook';
import { watchAutomationsEvents } from '@/shared/api/events';
import {
  gitFileStatusQueryKey,
  gitOrgSummaryQueryKey,
  watchGitFileStatus,
  watchGitSummary,
} from '@/shared/api/git';
import {
  deskAgentsQuery,
  deskAutomationsQuery,
  deskAutomationsQueryKey,
  deskBoardsQuery,
  deskGitSummaryQuery,
  deskIssuesQuery,
  deskLabelsQuery,
  deskSchedulesQuery,
  deskTerminalsQuery,
  deskThreadsQuery,
  deskWebhooksQuery,
} from './desk-queries';

function useDeskSlices(scopeId: string) {
  return useQueries({
    queries: [
      deskAgentsQuery(scopeId),
      deskThreadsQuery(scopeId),
      deskSchedulesQuery(scopeId),
      deskWebhooksQuery(scopeId),
      deskBoardsQuery(scopeId),
      deskLabelsQuery(scopeId),
      deskIssuesQuery(scopeId),
    ],
    combine: (results) => ({
      ready: results.every((result) => result.isSuccess),
      agents: results[0]?.data,
      threads: results[1]?.data,
      schedules: results[2]?.data,
      webhooks: results[3]?.data,
      boards: results[4]?.data,
      labels: results[5]?.data,
      issues: results[6]?.data,
    }),
  });
}

export function useDeskReady(scopeId: string | null): boolean {
  const { ready } = useDeskSlices(scopeId ?? '');
  return scopeId === null ? true : ready;
}

export function useDeskOrgExtrasSync(orgId: string | null): void {
  const queryClient = useQueryClient();
  useQuery(deskTerminalsQuery(orgId ?? ''));
  // Инициализируем кэш git summary один раз при монтировании DeskSync — это
  // единственное место, которое делает первый HTTP-фетч summary. Далее
  // обновления только через SSE (setQueryData) — без HTTP.
  useQuery({ ...deskGitSummaryQuery(orgId ?? ''), enabled: Boolean(orgId) });
  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchGitSummary((summaries) => {
      queryClient.setQueryData(gitOrgSummaryQueryKey(orgId), summaries);
    });
  }, [orgId, queryClient]);
  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchGitFileStatus((frame) => {
      if (frame.orgId !== orgId) {
        return;
      }
      queryClient.setQueryData(gitFileStatusQueryKey(frame.sourceId), {
        map: frame.map,
        truncated: frame.truncated,
      });
    });
  }, [orgId, queryClient]);
}

export function useDeskStoreSync(
  scopeId: string | null,
  options: { orgEntities?: boolean } = {},
): boolean {
  const queryClient = useQueryClient();
  const { ready, agents, threads, schedules, webhooks, boards, labels, issues } = useDeskSlices(
    scopeId ?? '',
  );
  const automationsQuery = useQuery({
    ...deskAutomationsQuery(scopeId ?? ''),
    enabled: Boolean(scopeId),
  });
  useEffect(() => {
    if (!scopeId) {
      return;
    }
    return watchAutomationsEvents(scopeId, () => {
      void queryClient.invalidateQueries({ queryKey: deskAutomationsQueryKey(scopeId) });
    });
  }, [scopeId, queryClient]);
  const { orgEntities = false } = options;
  useEffect(() => {
    if (!scopeId || !automationsQuery.data) {
      return;
    }
    useAutomationStore
      .getState()
      .replaceProject(scopeId, automationsQuery.data.map(toClientAutomation));
  }, [scopeId, automationsQuery.data]);
  useEffect(() => {
    if (!scopeId) {
      return;
    }
    if (agents) {
      useAgentStore
        .getState()
        .replaceOrg(
          scopeId,
          agents.items.filter((item) => item.status !== 'archived').map(toClientAgentFromPublic),
        );
    }
    if (threads) {
      useThreadStore.getState().replaceOrg(scopeId, threads.map(toClientThread));
    }
    if (schedules) {
      useScheduleStore.getState().replaceProject(scopeId, schedules.map(toClientSchedule));
    }
    if (webhooks) {
      useWebhookStore.getState().replaceProject(scopeId, webhooks.map(toClientWebhook));
    }
    if (orgEntities) {
      if (boards) {
        useIssueBoardStore.getState().replaceAll(boards);
      }
      if (labels) {
        useIssueLabelStore.getState().replaceAll(labels);
      }
      if (issues) {
        useIssueStore.getState().replaceAll(issues);
      }
    }
  }, [scopeId, agents, threads, schedules, webhooks, boards, labels, issues, orgEntities]);
  return ready;
}
