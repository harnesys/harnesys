import type { SessionEvent } from '@harnesys/studio-shared';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useProjects } from '@/entities/project';
import { useScheduleStore } from '@/entities/schedule';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import {
  studioFocusProjectId,
  studioFocusThreadId,
  useStudioLocation,
} from '@/shared/config/location';
import { useDeskStore } from './desk.store';
import { isWaiting } from './use-agent-live-status';

const EMPTY_EVENTS: SessionEvent[] = [];
export function useDeskSelection() {
  return useDeskStore(
    useShallow((state) => ({
      inspectorTab: state.inspectorTab,
      inspectorOpen: state.inspectorOpen,
    })),
  );
}
export function useProjectAgents(orgId: string | null) {
  return useAgentStore(
    useShallow((state) => (orgId ? state.items.filter((item) => item.orgId === orgId) : [])),
  );
}
export function useAgentsInProjects(orgIds: string[]) {
  return useAgentStore(
    useShallow((state) => state.items.filter((item) => orgIds.includes(item.orgId))),
  );
}
export function useAgentThreads(agentId: string | null) {
  return useThreadStore(useShallow((state) => (agentId ? state.forAgent(agentId) : [])));
}
export function useThreadEvents(threadId: string | null) {
  return useSessionStore((state) => {
    if (!threadId) {
      return EMPTY_EVENTS;
    }
    return state.events[threadId] ?? EMPTY_EVENTS;
  });
}
export function useProjectSchedules(projectId: string | null) {
  return useScheduleStore(
    useShallow((state) =>
      projectId ? state.items.filter((item) => item.projectId === projectId) : [],
    ),
  );
}
export function useSchedulesInProjects(projectIds: string[]) {
  return useScheduleStore(
    useShallow((state) => state.items.filter((item) => projectIds.includes(item.projectId))),
  );
}
export function useProjectWebhooks(projectId: string | null) {
  return useWebhookStore(
    useShallow((state) =>
      projectId ? state.items.filter((item) => item.projectId === projectId) : [],
    ),
  );
}
export function useWebhooksInProjects(projectIds: string[]) {
  return useWebhookStore(
    useShallow((state) => state.items.filter((item) => projectIds.includes(item.projectId))),
  );
}
export function useWaitingThreads(orgIds: string[]) {
  const items = useThreadStore(useShallow((state) => state.items));
  return useSessionStore(
    useShallow((state) =>
      items.filter(
        (item) =>
          orgIds.includes(item.orgId ?? '') &&
          (item.activeRun?.status === 'waiting' ||
            item.activeRun?.status === 'needs_input' ||
            isWaiting(state.events[item.id] ?? [])),
      ),
    ),
  );
}
export function useErroredThreads(orgIds: string[]) {
  return useThreadStore(
    useShallow((state) =>
      state.items.filter(
        (item) =>
          orgIds.includes(item.orgId ?? '') &&
          item.lastError !== null &&
          item.lastError !== undefined,
      ),
    ),
  );
}
export function useSelectedAgent() {
  const { focus } = useStudioLocation();
  const threadId = studioFocusThreadId(focus);
  const scheduleId = focus.kind === 'schedule' ? focus.scheduleId : null;
  const webhookId = focus.kind === 'webhook' ? focus.webhookId : null;
  const thread = useThreadStore(
    useShallow((state) => (threadId ? (state.byId(threadId) ?? null) : null)),
  );
  const schedule = useScheduleStore(
    useShallow((state) =>
      scheduleId ? (state.items.find((item) => item.id === scheduleId) ?? null) : null,
    ),
  );
  const webhook = useWebhookStore(
    useShallow((state) =>
      webhookId ? (state.items.find((item) => item.id === webhookId) ?? null) : null,
    ),
  );
  const agentId = thread?.agentId ?? schedule?.targetAgentId ?? webhook?.targetAgentId ?? null;
  return useAgentStore(useShallow((state) => (agentId ? (state.byId(agentId) ?? null) : null)));
}
export function useSelectedThread() {
  const { focus } = useStudioLocation();
  const threadId = studioFocusThreadId(focus);
  const scheduleId = focus.kind === 'schedule' ? focus.scheduleId : null;
  const webhookId = focus.kind === 'webhook' ? focus.webhookId : null;
  const focusedThreadId = useDeskStore((state) => state.focusedThreadId);
  const scheduleThreadId = useScheduleStore((state) =>
    scheduleId ? (state.items.find((item) => item.id === scheduleId)?.threadId ?? null) : null,
  );
  const webhookThreadId = useWebhookStore((state) =>
    webhookId ? (state.items.find((item) => item.id === webhookId)?.threadId ?? null) : null,
  );
  const preferredId = threadId ?? scheduleThreadId ?? webhookThreadId ?? focusedThreadId;
  return useThreadStore(
    useShallow((state) => (preferredId ? (state.byId(preferredId) ?? null) : null)),
  );
}
export function useDesk() {
  const { orgId, focus } = useStudioLocation();
  const projectId = studioFocusProjectId(focus);
  const projectQuery = useProjects();
  const desk = useDeskSelection();
  const agents = useProjectAgents(orgId);
  const agent = useSelectedAgent();
  const threads = useAgentThreads(agent?.id ?? null);
  const thread = useSelectedThread();
  const events = useThreadEvents(thread?.id ?? null);
  const schedules = useProjectSchedules(projectId);
  const webhooks = useProjectWebhooks(projectId);
  return {
    projectId,
    focus,
    project: projectQuery.data?.find((item) => item.id === projectId) ?? null,
    projects: projectQuery.data ?? [],
    projectsStatus: projectQuery.status,
    agents,
    agent,
    threads,
    thread,
    events,
    schedules,
    webhooks,
    inspectorTab: desk.inspectorTab,
    inspectorOpen: desk.inspectorOpen,
  };
}
