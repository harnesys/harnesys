import { useShallow } from 'zustand/react/shallow';
import { useProjects } from '@/entities/project';
import { useThreadStore } from '@/entities/thread';
import {
  useAgentsInProjects,
  useDeskReady,
  useErroredThreads,
  useWaitingThreads,
} from '@/features/desk';
import { useIdeTabs } from '@/features/ide';
import { studioFocusThreadId, useStudioLocation } from '@/shared/config/location';
import {
  type SectionParts,
  type SectionPartsContext,
  type SidebarSectionId,
  sectionParts,
} from '@/widgets/project-sidebar';

const noop = () => undefined;

export function useRailParts(): (id: SidebarSectionId) => SectionParts {
  const { orgId, focus } = useStudioLocation();
  const threadId = studioFocusThreadId(focus);
  const projectQuery = useProjects();
  const projectIds = (projectQuery.data ?? []).map((project) => project.id);
  const agentScopeIds = orgId ? [...projectIds, orgId] : projectIds;
  const inboxThreads = useWaitingThreads(agentScopeIds);
  const errorThreads = useErroredThreads(agentScopeIds);
  const channels = useThreadStore(
    useShallow((state) =>
      orgId ? state.items.filter((item) => item.orgId === orgId && item.kind === 'group') : [],
    ),
  );
  const agents = useAgentsInProjects(agentScopeIds);
  const deskPending = !useDeskReady(orgId);
  const ideTabs = useIdeTabs();
  const activeThreadId = ideTabs.tabs.find((tab) => tab.id === ideTabs.activeId)?.threadId ?? null;
  const activeAgentId = useThreadStore((state) =>
    threadId ? (state.byId(threadId)?.agentId ?? null) : null,
  );
  const context: SectionPartsContext = {
    agents,
    inboxThreads,
    errorThreads,
    channels,
    projectIds,
    activeAgentId,
    activeThreadId,
    activeBoardId: focus.kind === 'board' ? focus.boardId : null,
    activeTerminalSessionId: focus.kind === 'terminal' ? focus.sessionId : null,
    deskPending,
    onSelectDone: noop,
  };
  return (id) => sectionParts(id, context);
}
