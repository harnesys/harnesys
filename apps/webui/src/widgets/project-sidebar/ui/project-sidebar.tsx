import { useQuery } from '@tanstack/react-query';
import { InboxIcon } from 'lucide-react';
import {
  Fragment,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router';
import { useIssueBoardStore } from '@/entities/issue';
import { useProjects } from '@/entities/project';
import { useThreadStore } from '@/entities/thread';
import { isDesktop, useAppUpdateStore } from '@/features/app-update';
import { isNewerVersion, releasesQuery } from '@/features/app-update/model/server-update';
import {
  useAgentsInProjects,
  useDeskStore,
  useErroredThreads,
  useSchedulesInProjects,
  useWaitingThreads,
  useWebhooksInProjects,
} from '@/features/desk';
import { useIdeTabs } from '@/features/ide';
import { OrgHeader } from '@/features/switch-org';
import { appMetaQuery } from '@/shared/api';
import { studioFocusThreadId, useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { AppLogo } from '@/shared/ui/app-logo';
import { Badge } from '@/shared/ui/badge.tsx';
import { Resizer } from '@/shared/ui/resizer';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/shared/ui/sidebar';
import { normalizeShares, useAccordionStore } from '../model/accordion.store';
import { useSectionDnd } from '../model/use-section-dnd';
import { AccordionSection } from './accordion-section';
import { AgentsSection, AgentsSectionActions } from './agents-section';
import { AutomationsSection, AutomationsSectionActions } from './automations-section';
import { GitSectionActions, GitTitle } from './git-menu';
import { GitSection } from './git-section';
import { InboxSection } from './inbox-section';
import { IssuesSection, IssuesSectionActions } from './issues-section';
import { ProjectsActions, ProjectsTitle, ProjectsTrees } from './projects-section';
import { SECTION_META, type SidebarSectionId } from './sections-meta';
import { SidebarSectionsConfig } from './sidebar-sections-config';
import { SidebarSectionsVisibility } from './sidebar-sections-visibility';
import { TerminalSection, TerminalSectionActions } from './terminal-section';

const inboxCountBadge = (errors: number, waiting: number): ReactNode => {
  const badges: ReactNode[] = [];
  if (errors > 0) {
    badges.push(
      <Badge
        key="errors"
        variant="destructive"
        className="h-4 px-1.5 font-normal text-[10px] tabular-nums leading-none"
      >
        {errors}
      </Badge>,
    );
  }
  if (waiting > 0) {
    badges.push(
      <Badge
        key="waiting"
        variant="secondary"
        className="h-4 bg-[var(--color-live)]/15 px-1.5 font-normal text-[10px] text-[var(--color-live)] tabular-nums leading-none"
      >
        {waiting}
      </Badge>,
    );
  }
  return badges.length > 0 ? <span className="flex items-center gap-1">{badges}</span> : null;
};

type OrderedSectionId = Exclude<SidebarSectionId, 'inbox'>;
export function ProjectSidebar({
  onResizeStart,
}: {
  onResizeStart?: (event: ReactMouseEvent) => void;
}) {
  const { orgId, focus } = useStudioLocation();
  const { data: meta } = useQuery(appMetaQuery(orgId));
  const releases = useQuery(releasesQuery);
  const updateStatus = useAppUpdateStore((state) => state.status);
  const latestRelease = releases.data?.[0];
  const currentVersion = meta?.version;
  const versionUpdatePending = isDesktop()
    ? updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'ready'
    : Boolean(
        typeof currentVersion === 'string' &&
          typeof latestRelease?.version === 'string' &&
          isNewerVersion(currentVersion, latestRelease.version),
      );
  const threadId = studioFocusThreadId(focus);
  const projectQuery = useProjects();
  const projectIds = (projectQuery.data ?? []).map((project) => project.id);
  const agentScopeIds = orgId ? [...projectIds, orgId] : projectIds;
  const automationScopeIds = orgId ? [orgId] : projectIds;
  const inboxThreads = useWaitingThreads(agentScopeIds);
  const errorThreads = useErroredThreads(agentScopeIds);
  const agents = useAgentsInProjects(agentScopeIds);
  const schedules = useSchedulesInProjects(automationScopeIds);
  const webhooks = useWebhooksInProjects(automationScopeIds);
  const boards = useIssueBoardStore((state) => state.boards);
  const deskPending = useDeskStore((state) => (orgId ? state.hydrated[orgId] !== 'ready' : true));
  const { setOpenMobile, state } = useSidebar();
  const ideTabs = useIdeTabs();
  const activeThreadId = ideTabs.tabs.find((tab) => tab.id === ideTabs.activeId)?.threadId ?? null;
  const activeAgentId = useThreadStore((state) =>
    threadId ? (state.byId(threadId)?.agentId ?? null) : null,
  );
  const activeScheduleId = focus.kind === 'schedule' ? focus.scheduleId : null;
  const activeWebhookId = focus.kind === 'webhook' ? focus.webhookId : null;
  const activeBoardId = focus.kind === 'board' ? focus.boardId : null;
  const activeTerminalSessionId = focus.kind === 'terminal' ? focus.sessionId : null;
  const collapsed = useAccordionStore((state) => state.collapsed);
  const sizes = useAccordionStore((state) => state.sizes);
  const order = useAccordionStore((state) => state.order);
  const hidden = useAccordionStore((state) => state.hidden);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPair, setDragPair] = useState<string | null>(null);
  const { draggingId, dropHintFor, headerProps } = useSectionDnd();
  const visibleSections = order.filter((id): id is OrderedSectionId => !hidden[id]);
  const expanded = visibleSections.filter((id) => !(collapsed[id] ?? false));
  const inboxVisible = !hidden.inbox;
  const inboxExpanded = inboxVisible && !(collapsed.inbox ?? false);
  const expandedWithInbox = inboxExpanded ? ['inbox', ...expanded] : expanded;
  const shares = normalizeShares(expandedWithInbox, sizes);
  const resizePairs: {
    upper: string;
    lower: string;
  }[] = [];
  let lastExpanded: string | null = null;
  for (const id of expandedWithInbox) {
    if (lastExpanded) {
      resizePairs.push({ upper: lastExpanded, lower: id });
    }
    lastExpanded = id;
  }
  const pairBefore = (id: string) => resizePairs.find((pair) => pair.lower === id) ?? null;
  const resizeNode = (id: OrderedSectionId) => {
    const pair = pairBefore(id);
    if (!pair) {
      return null;
    }
    const key = `${pair.upper}:${pair.lower}`;
    return (
      <Resizer
        key={key}
        label={`Resize ${SECTION_META[pair.upper as SidebarSectionId]?.label ?? pair.upper} and ${SECTION_META[pair.lower as SidebarSectionId]?.label ?? pair.lower}`}
        testId={`accordion-resize-${pair.upper}-${pair.lower}`}
        dragging={dragPair === key}
        orientation="vertical"
        onResizeStart={beginResize(pair.upper, pair.lower)}
      />
    );
  };
  const beginResize = (upperId: string, lowerId: string) => (event: ReactMouseEvent) => {
    event.preventDefault();
    const root = containerRef.current;
    const upper = root?.querySelector(`[data-accordion-content="${upperId}"]`);
    const lower = root?.querySelector(`[data-accordion-content="${lowerId}"]`);
    if (!upper || !lower) {
      return;
    }
    const upperPx = upper.getBoundingClientRect().height;
    const lowerPx = lower.getBoundingClientRect().height;
    const totalPx = upperPx + lowerPx;
    if (totalPx <= 0) {
      return;
    }
    const startY = event.clientY;
    setDragPair(`${upperId}:${lowerId}`);
    const onMove = (moveEvent: MouseEvent) => {
      const current = useAccordionStore.getState().sizes;
      const pairSum = (current[upperId] ?? 1) + (current[lowerId] ?? 1);
      const ratio = Math.min(1, Math.max(0, (upperPx + moveEvent.clientY - startY) / totalPx));
      useAccordionStore
        .getState()
        .setSizes({ ...current, [upperId]: pairSum * ratio, [lowerId]: pairSum * (1 - ratio) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragPair(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const renderSection = (id: OrderedSectionId) => {
    const Icon = SECTION_META[id].icon;
    const drag = {
      headerDragProps: headerProps(id),
      dragging: draggingId === id,
      dropHint: dropHintFor(id),
    };
    switch (id) {
      case 'agents':
        return (
          <AccordionSection
            id="agents"
            icon={<Icon />}
            title="Agents"
            count={agents.filter((agent) => !agent.parentId).length}
            size={shares[id] ?? 1}
            actions={<AgentsSectionActions onCreated={() => setOpenMobile(false)} />}
            {...drag}
          >
            <AgentsSection
              agents={agents}
              activeAgentId={activeAgentId}
              activeThreadId={activeThreadId}
              onSelectDone={() => setOpenMobile(false)}
              loading={deskPending}
            />
          </AccordionSection>
        );
      case 'projects':
        return (
          <AccordionSection
            id="projects"
            icon={<Icon />}
            title={<ProjectsTitle />}
            size={shares[id] ?? 1}
            actions={<ProjectsActions />}
            {...drag}
          >
            <ProjectsTrees projectIds={projectIds} />
          </AccordionSection>
        );
      case 'issues':
        return (
          <AccordionSection
            id="issues"
            icon={<Icon />}
            title="Issues"
            count={boards.length}
            size={shares[id] ?? 1}
            actions={<IssuesSectionActions />}
            {...drag}
          >
            <IssuesSection
              activeBoardId={activeBoardId}
              onSelectDone={() => setOpenMobile(false)}
              loading={deskPending}
            />
          </AccordionSection>
        );
      case 'automations':
        return (
          <AccordionSection
            id="automations"
            icon={<Icon />}
            title="Automations"
            count={schedules.length + webhooks.length}
            size={shares[id] ?? 1}
            actions={
              <AutomationsSectionActions agents={agents} onDone={() => setOpenMobile(false)} />
            }
            {...drag}
          >
            <AutomationsSection
              agents={agents}
              schedules={schedules}
              webhooks={webhooks}
              activeScheduleId={activeScheduleId}
              activeWebhookId={activeWebhookId}
              activeThreadId={activeThreadId}
              onSelectDone={() => setOpenMobile(false)}
            />
          </AccordionSection>
        );
      case 'git':
        return (
          <AccordionSection
            id="git"
            icon={<Icon />}
            title={<GitTitle />}
            size={shares[id] ?? 1}
            actions={<GitSectionActions />}
            {...drag}
          >
            <GitSection />
          </AccordionSection>
        );
      case 'terminal':
        return (
          <AccordionSection
            id="terminal"
            icon={<Icon />}
            title="Terminal"
            size={shares[id] ?? 1}
            actions={<TerminalSectionActions onCreated={() => setOpenMobile(false)} />}
            {...drag}
          >
            <TerminalSection
              activeSessionId={activeTerminalSessionId}
              onSelectDone={() => setOpenMobile(false)}
            />
          </AccordionSection>
        );
    }
  };
  return (
    <Sidebar collapsible="icon" data-testid="project-sidebar">
      <SidebarHeader className="flex flex-col gap-1 p-2 group-data-[collapsible=icon]:items-center">
        <OrgHeader inboxCount={inboxThreads.length + errorThreads.length} />
      </SidebarHeader>

      <SidebarContent className="gap-1 group-data-[collapsible=icon]:overflow-y-auto">
        <div ref={containerRef} className="flex min-h-0 flex-auto flex-col gap-1 px-2 pb-2">
          {inboxVisible ? (
            <AccordionSection
              id="inbox"
              icon={<InboxIcon />}
              title="Inbox"
              count={inboxThreads.length + errorThreads.length}
              badge={inboxCountBadge(errorThreads.length, inboxThreads.length)}
              size={shares.inbox ?? 1}
            >
              <InboxSection
                threads={[...errorThreads, ...inboxThreads]}
                activeThreadId={activeThreadId}
                onSelectDone={() => setOpenMobile(false)}
              />
            </AccordionSection>
          ) : null}
          {visibleSections.map((id, index) => (
            <Fragment key={id}>
              {index > 0 || inboxExpanded ? resizeNode(id) : null}
              {renderSection(id)}
            </Fragment>
          ))}
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem className="flex flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col-reverse">
            <div
              className="flex flex-1 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              data-testid="app-logo"
              title="Harnesys"
            >
              <AppLogo className="size-5" />
              <span className="flex items-center gap-1 font-medium text-sm tracking-tight group-data-[collapsible=icon]:hidden">
                Harnesys
                {meta && orgId ? (
                  <Link
                    to={studioPath.settings(orgId, 'updates')}
                    data-testid="app-version-badge"
                    title="Open update settings"
                    className="group/version-badge relative inline-flex cursor-pointer items-center"
                  >
                    <Badge
                      variant="secondary"
                      className="text-muted-foreground transition-colors group-hover/version-badge:bg-foreground/10"
                    >
                      v{meta.version}
                    </Badge>
                    {versionUpdatePending ? (
                      <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-live" />
                    ) : null}
                  </Link>
                ) : null}
              </span>
            </div>
            <SidebarSectionsVisibility />
            <SidebarSectionsConfig />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      {state === 'expanded' && onResizeStart ? (
        <div className="absolute inset-y-0 right-0 z-20 flex w-1 justify-center">
          <Resizer
            label="Resize sidebar"
            testId="sidebar-resize"
            orientation="horizontal"
            dragging={false}
            onResizeStart={onResizeStart}
          />
        </div>
      ) : null}
    </Sidebar>
  );
}
