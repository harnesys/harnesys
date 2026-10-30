import { toClientAgentFromPublic, useAgentStore } from '@/entities/agent';
import { useIssueBoardStore, useIssueLabelStore, useIssueStore } from '@/entities/issue';
import { toClientSchedule, useScheduleStore } from '@/entities/schedule';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { toClientWebhook, useWebhookStore } from '@/entities/webhook';
import {
  fetchOrgAgents,
  listIssueBoards,
  listIssueLabels,
  listIssues,
  listSchedules,
  listThreads,
  listWebhooks,
} from '@/shared/api';
import { useDeskStore } from './desk.store';

const inflight = new Map<string, Promise<void>>();

export function hydrateOrgDesk(orgId: string): Promise<void> {
  return hydrateDesk(orgId);
}

export function hydrateDesk(scopeId: string): Promise<void> {
  if (useDeskStore.getState().hydrated[scopeId] === 'ready') {
    return Promise.resolve();
  }
  const running = inflight.get(scopeId);
  if (running) {
    return running;
  }
  useDeskStore.getState().setHydrateStatus(scopeId, 'pending');
  const task = loadDesk(scopeId)
    .then(() => {
      useDeskStore.getState().setHydrateStatus(scopeId, 'ready');
    })
    .catch((error: unknown) => {
      useDeskStore.getState().setHydrateStatus(scopeId, null);
      throw error;
    })
    .finally(() => {
      if (inflight.get(scopeId) === task) {
        inflight.delete(scopeId);
      }
    });
  inflight.set(scopeId, task);
  return task;
}

async function loadDesk(scopeId: string): Promise<void> {
  // Hydrate is always called with an explicit org/project id, so load it
  // directly; gating on the module-level active org races with OrgScopeSync
  // and used to mark the scope ready with empty stores.
  await loadOrgDesk(scopeId);
}

async function loadOrgDesk(orgId: string): Promise<void> {
  // render while slow ones (threads) are still pending. Ready is set only
  // when every slice settles; failures keep committed slices and reset the
  // status so the next navigation retries.
  const slices: Array<Promise<void>> = [
    fetchOrgAgents(orgId).then((agentsResponse) => {
      useAgentStore
        .getState()
        .replaceOrg(
          orgId,
          agentsResponse.items
            .filter((item) => item.status !== 'archived')
            .map(toClientAgentFromPublic),
        );
    }),
    listThreads(orgId).then((summaries) => {
      useThreadStore.getState().replaceOrg(orgId, summaries.map(toClientThread));
    }),
    listSchedules(orgId).then((schedules) => {
      useScheduleStore.getState().replaceProject(orgId, schedules.map(toClientSchedule));
    }),
    listWebhooks(orgId).then((webhooks) => {
      useWebhookStore.getState().replaceProject(orgId, webhooks.map(toClientWebhook));
    }),
    listIssueBoards(orgId).then((boards) => {
      useIssueBoardStore.getState().replaceAll(boards);
    }),
    listIssueLabels(orgId).then((labels) => {
      useIssueLabelStore.getState().replaceAll(labels);
    }),
    listIssues(orgId).then((issues) => {
      useIssueStore.getState().replaceAll(issues);
    }),
  ];
  const results = await Promise.allSettled(slices);
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected) {
    throw rejected.reason;
  }
}
