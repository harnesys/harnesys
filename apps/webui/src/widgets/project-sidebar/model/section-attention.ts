import { useProjects } from '@/entities/project';
import { useErroredThreads, useOrgTerminals, useWaitingThreads } from '@/features/desk';
import { useOrgId } from '@/shared/config/location';
import type { SidebarSectionId } from '../ui/sections-meta';

export type SectionAttention = Partial<Record<SidebarSectionId, boolean>>;

export function useSectionAttention(): SectionAttention {
  const routeOrgId = useOrgId();
  const projectQuery = useProjects();
  const projectIds = (projectQuery.data ?? []).map((project) => project.id);
  const scopeIds = routeOrgId ? [...projectIds, routeOrgId] : projectIds;
  const waiting = useWaitingThreads(scopeIds);
  const errored = useErroredThreads(scopeIds);
  const terminals = useOrgTerminals();
  const attention: SectionAttention = {};
  if (waiting.length + errored.length > 0) {
    attention.inbox = true;
  }
  if (terminals.some((session) => session.exited)) {
    attention.terminal = true;
  }
  return attention;
}

export function hasHiddenAttention(
  sections: SidebarSectionId[],
  hidden: Partial<Record<SidebarSectionId, boolean>>,
  attention: SectionAttention,
): boolean {
  return sections.some((id) => hidden[id] && attention[id]);
}
