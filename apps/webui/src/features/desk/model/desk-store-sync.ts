import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toClientAgentFromPublic, useAgentStore } from '@/entities/agent';
import { useIssueBoardStore, useIssueLabelStore, useIssueStore } from '@/entities/issue';
import { toClientSchedule, useScheduleStore } from '@/entities/schedule';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { toClientWebhook, useWebhookStore } from '@/entities/webhook';
import {
  deskAgentsQuery,
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
  return useDeskSlices(scopeId ?? '').ready;
}

export function useDeskOrgExtrasSync(orgId: string | null): void {
  const orgReady = useDeskReady(orgId);
  useQuery(deskTerminalsQuery(orgId ?? ''));
  // Git summary is expensive; wait until the desk slices settle so it does
  // not compete with them at boot (old hydrate gating, kept 1:1).
  useQuery({ ...deskGitSummaryQuery(orgId ?? ''), enabled: Boolean(orgId) && orgReady });
}

export function useDeskStoreSync(scopeId: string | null): boolean {
  const { ready, agents, threads, schedules, webhooks, boards, labels, issues } = useDeskSlices(
    scopeId ?? '',
  );
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
    if (boards) {
      useIssueBoardStore.getState().replaceAll(boards);
    }
    if (labels) {
      useIssueLabelStore.getState().replaceAll(labels);
    }
    if (issues) {
      useIssueStore.getState().replaceAll(issues);
    }
  }, [scopeId, agents, threads, schedules, webhooks, boards, labels, issues]);
  return ready;
}
