import { useShallow } from 'zustand/react/shallow';
import { isCoreAutomation } from '@/entities/automation';
import { useProjects } from '@/entities/project';
import { useSessionStore } from '@/entities/session';
import { type Thread, useThreadStore } from '@/entities/thread';
import {
  useAutomationsInProjects,
  useErroredThreads,
  useOrgTerminals,
  useWaitingThreads,
} from '@/features/desk';
import { useOrgId } from '@/shared/config/location';
import type { SidebarSectionId } from '../ui/sections-meta';

export interface SectionSignal {
  live: boolean;
  attention: number;
  critical: boolean;
}

export type SectionSignals = Partial<Record<SidebarSectionId, SectionSignal>>;

const NO_SIGNAL: SectionSignal = { live: false, attention: 0, critical: false };

function hasSignal(signal: SectionSignal | undefined): boolean {
  return Boolean(signal && (signal.live || signal.attention > 0));
}

export function useSectionSignals(): SectionSignals {
  const orgId = useOrgId();
  const projectIds = (useProjects().data ?? []).map((project) => project.id);
  const scopeIds = orgId ? [...projectIds, orgId] : projectIds;
  const threads = useThreadStore(
    useShallow((state) => state.items.filter((item) => scopeIds.includes(item.orgId ?? ''))),
  );
  const runningIds = useSessionStore(useShallow((state) => Object.keys(state.activeRuns)));
  const waiting = useWaitingThreads(scopeIds);
  const errored = useErroredThreads(scopeIds);
  const terminals = useOrgTerminals();
  const automations = useAutomationsInProjects(orgId ? [orgId] : []);

  const running = new Set(runningIds);
  const isLive = (thread: Thread) =>
    running.has(thread.id) ||
    thread.activeRun?.status === 'running' ||
    thread.activeRun?.status === 'queued';

  const attentionIds = new Set<string>();
  for (const thread of threads) {
    if (thread.unread) {
      attentionIds.add(thread.id);
    }
  }
  for (const thread of waiting) {
    attentionIds.add(thread.id);
  }
  for (const thread of errored) {
    attentionIds.add(thread.id);
  }

  const summarize = (subset: Thread[]): SectionSignal => {
    if (subset.length === 0) {
      return NO_SIGNAL;
    }
    let live = false;
    let attention = 0;
    let critical = false;
    for (const thread of subset) {
      if (attentionIds.has(thread.id)) {
        attention += 1;
      }
      if (thread.lastError) {
        critical = true;
      }
      if (isLive(thread)) {
        live = true;
      }
    }
    return { live, attention, critical };
  };

  const threadsById = new Map(threads.map((thread) => [thread.id, thread]));
  const automationThreads: Thread[] = [];
  let failedAutomations = 0;
  for (const automation of automations) {
    if (isCoreAutomation(automation)) {
      continue;
    }
    if (automation.status === 'failed') {
      failedAutomations += 1;
    }
    const thread = automation.threadId ? threadsById.get(automation.threadId) : undefined;
    if (thread) {
      automationThreads.push(thread);
    }
  }
  const automationSignal = summarize(automationThreads);
  const inboxThreadIds = new Set([...waiting, ...errored].map((thread) => thread.id));
  const exitedTerminals = terminals.filter((session) => session.exited).length;

  return {
    inbox: {
      live: false,
      attention: inboxThreadIds.size,
      critical: errored.length > 0,
    },
    agents: summarize(threads.filter((thread) => thread.kind === 'chat')),
    channels: summarize(threads.filter((thread) => thread.kind === 'group')),
    issues: summarize(threads.filter((thread) => thread.issueId != null)),
    automations: {
      live: automationSignal.live,
      attention: automationSignal.attention + failedAutomations,
      critical: automationSignal.critical || failedAutomations > 0,
    },
    terminal: {
      live: terminals.length > exitedTerminals,
      attention: exitedTerminals,
      critical: false,
    },
  };
}

export function hasHiddenSignal(
  sections: SidebarSectionId[],
  hidden: Partial<Record<SidebarSectionId, boolean>>,
  signals: SectionSignals,
): boolean {
  return sections.some((id) => hidden[id] === true && hasSignal(signals[id]));
}
