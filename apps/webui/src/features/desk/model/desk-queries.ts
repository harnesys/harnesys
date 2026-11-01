import { queryOptions } from '@tanstack/react-query';
import {
  fetchOrgAgents,
  listIssueBoards,
  listIssueLabels,
  listIssues,
  listOrgTerminals,
  listSchedules,
  listThreads,
  listWebhooks,
} from '@/shared/api';
import { getOrgGitSummary, gitOrgSummaryQueryKey } from '@/shared/api/git';

export const DESK_QUERY_KEY = ['desk'] as const;

function deskQueryKey(entity: string, scopeId: string) {
  return [...DESK_QUERY_KEY, entity, scopeId] as const;
}

export function deskAgentsQuery(scopeId: string) {
  return queryOptions({
    queryKey: deskQueryKey('agents', scopeId),
    queryFn: () => fetchOrgAgents(scopeId),
    enabled: Boolean(scopeId),
  });
}

export function deskThreadsQuery(scopeId: string) {
  return queryOptions({
    queryKey: deskQueryKey('threads', scopeId),
    queryFn: () => listThreads(scopeId),
    enabled: Boolean(scopeId),
  });
}

export function deskSchedulesQuery(scopeId: string) {
  return queryOptions({
    queryKey: deskQueryKey('schedules', scopeId),
    queryFn: () => listSchedules(scopeId),
    enabled: Boolean(scopeId),
  });
}

export function deskWebhooksQuery(scopeId: string) {
  return queryOptions({
    queryKey: deskQueryKey('webhooks', scopeId),
    queryFn: () => listWebhooks(scopeId),
    enabled: Boolean(scopeId),
  });
}

export function deskBoardsQuery(scopeId: string) {
  return queryOptions({
    queryKey: deskQueryKey('boards', scopeId),
    queryFn: () => listIssueBoards(scopeId),
    enabled: Boolean(scopeId),
  });
}

export function deskLabelsQuery(scopeId: string) {
  return queryOptions({
    queryKey: deskQueryKey('labels', scopeId),
    queryFn: () => listIssueLabels(scopeId),
    enabled: Boolean(scopeId),
  });
}

export function deskIssuesQuery(scopeId: string) {
  return queryOptions({
    queryKey: deskQueryKey('issues', scopeId),
    queryFn: () => listIssues(scopeId),
    enabled: Boolean(scopeId),
  });
}

export const deskTerminalsKey = [...DESK_QUERY_KEY, 'terminals'] as const;

export function deskTerminalsQueryKey(orgId: string) {
  return [...deskTerminalsKey, orgId] as const;
}

export function deskTerminalsQuery(orgId: string) {
  return queryOptions({
    queryKey: deskTerminalsQueryKey(orgId),
    queryFn: () => listOrgTerminals(orgId),
    enabled: Boolean(orgId),
    staleTime: 5000,
  });
}

export function deskGitSummaryQuery(orgId: string) {
  return queryOptions({
    queryKey: gitOrgSummaryQueryKey(orgId),
    queryFn: () => getOrgGitSummary(orgId),
    enabled: Boolean(orgId),
    staleTime: Infinity,
  });
}
