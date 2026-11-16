import { useQuery } from '@tanstack/react-query';
import { Fragment, type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useIssueBoardStore } from '@/entities/issue';
import { useProjects } from '@/entities/project';
import { useThreadStore } from '@/entities/thread';
import { isDesktop, useAppUpdateStore } from '@/features/app-update';
import { isNewerVersion, releasesQuery } from '@/features/app-update/model/server-update';
import {
  useAgentsInProjects,
  useAutomationsInProjects,
  useDeskReady,
  useErroredThreads,
  useOrgTerminals,
  useWaitingThreads,
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
import { useSectionAttention } from '../model/section-attention';
import { useSectionDnd } from '../model/use-section-dnd';
import { AccordionSection } from './accordion-section';
import { sectionParts } from './section-parts';
import { SectionRail } from './section-rail';
import { SECTION_META, type SidebarSectionId } from './sections-meta';
import { SidebarSectionsConfig } from './sidebar-sections-config';
import { SidebarSectionsVisibility } from './sidebar-sections-visibility';

type OrderedSectionId = Exclude<SidebarSectionId, 'inbox'>;
function isIconMode(state: 'expanded' | 'collapsed', isMobile: boolean): boolean {
  return state === 'collapsed' && !isMobile;
}
function railSectionIds(
  visibleSections: OrderedSectionId[],
  inboxVisible: boolean,
): SidebarSectionId[] {
  return inboxVisible ? ['inbox', ...visibleSections] : visibleSections;
}
function startAccordionResize({
  event,
  upperId,
  lowerId,
  root,
  onDragging,
}: {
  event: ReactMouseEvent;
  upperId: string;
  lowerId: string;
  root: HTMLDivElement | null;
  onDragging: (pair: string | null) => void;
}): void {
  event.preventDefault();
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
  onDragging(`${upperId}:${lowerId}`);
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
    onDragging(null);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
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
  const automations = useAutomationsInProjects(automationScopeIds);
  const boards = useIssueBoardStore((state) => state.boards);
  const terminals = useOrgTerminals();
  const deskPending = !useDeskReady(orgId);
  const { setOpenMobile, state, isMobile } = useSidebar();
  const iconMode = isIconMode(state, isMobile);
  const ideTabs = useIdeTabs();
  const activeThreadId = ideTabs.tabs.find((tab) => tab.id === ideTabs.activeId)?.threadId ?? null;
  const activeAgentId = useThreadStore((state) =>
    threadId ? (state.byId(threadId)?.agentId ?? null) : null,
  );
  const activeBoardId = focus.kind === 'board' ? focus.boardId : null;
  const activeTerminalSessionId = focus.kind === 'terminal' ? focus.sessionId : null;
  const collapsed = useAccordionStore((state) => state.collapsed);
  const sizes = useAccordionStore((state) => state.sizes);
  const order = useAccordionStore((state) => state.order);
  const hidden = useAccordionStore((state) => state.hidden);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPair, setDragPair] = useState<string | null>(null);
  const { draggingId, dropHintFor, headerProps } = useSectionDnd();
  const attention = useSectionAttention();
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
        revealOnHover
        onResizeStart={(event) =>
          startAccordionResize({
            event,
            upperId: pair.upper,
            lowerId: pair.lower,
            root: containerRef.current,
            onDragging: setDragPair,
          })
        }
      />
    );
  };
  const onSelectDone = () => setOpenMobile(false);
  const partsContext = {
    agents,
    automations,
    boards,
    terminals,
    inboxThreads,
    errorThreads,
    projectIds,
    activeAgentId,
    activeThreadId,
    activeBoardId,
    activeTerminalSessionId,
    deskPending,
    onSelectDone,
  };
  const partsFor = (id: SidebarSectionId) => sectionParts(id, partsContext);
  return (
    <Sidebar collapsible="icon" data-testid="project-sidebar">
      <SidebarHeader className="flex flex-col gap-1 p-2 group-data-[collapsible=icon]:items-center">
        <OrgHeader />
      </SidebarHeader>

      <SidebarContent className="gap-1 group-data-[collapsible=icon]:overflow-y-auto">
        {iconMode ? (
          <SectionRail
            ids={railSectionIds(visibleSections, inboxVisible)}
            parts={partsFor}
            attention={attention}
          />
        ) : (
          <div ref={containerRef} className="flex min-h-0 flex-auto flex-col gap-1 px-2 pb-2">
            {inboxVisible ? (
              <AccordionSection
                id="inbox"
                resizer={null}
                icon={partsFor('inbox').icon}
                title={partsFor('inbox').title}
                count={partsFor('inbox').count}
                badge={partsFor('inbox').badge}
                size={shares.inbox ?? 1}
              >
                {partsFor('inbox').content}
              </AccordionSection>
            ) : null}
            {visibleSections.map((id) => {
              const parts = partsFor(id);
              return (
                <Fragment key={id}>
                  <AccordionSection
                    id={id}
                    resizer={resizeNode(id)}
                    icon={parts.icon}
                    title={parts.title}
                    count={parts.count}
                    badge={parts.badge}
                    actions={parts.actions}
                    horizontalScroll={parts.horizontalScroll}
                    size={shares[id] ?? 1}
                    headerDragProps={headerProps(id)}
                    dragging={draggingId === id}
                    dropHint={dropHintFor(id)}
                  >
                    {parts.content}
                  </AccordionSection>
                </Fragment>
              );
            })}
          </div>
        )}
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
