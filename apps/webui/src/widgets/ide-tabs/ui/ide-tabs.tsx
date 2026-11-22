import { EllipsisIcon, PanelRightIcon, XIcon } from 'lucide-react';
import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useActiveOrgStore } from '@/entities/org-machine';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useAgentsDisplayStore, useDeskStore } from '@/features/desk';
import { type IdeTab, pathForIdeTab, useIdeGroup, useIdeStore, useIdeTabs } from '@/features/ide';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SidebarTrigger } from '@/shared/ui/sidebar';
import { ideDrag, setIdeDrag, takeIdeDrag } from '../model/ide-dnd';
import { GroupMenuItems } from './group-menu-items';
import { TabIcon, useTabLabel } from './tab-meta';

export function IdeGroupTabs({
  groupId,
  leading = false,
  trailing = false,
}: {
  groupId: string;
  leading?: boolean;
  trailing?: boolean;
}) {
  const group = useIdeGroup(groupId);
  const ws = useIdeTabs();
  const navigate = useNavigate();
  const urlOrgId = useOrgId();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = urlOrgId ?? storeOrgId ?? '';
  const { openDesk } = useStudioNavigation();
  const inspectorOpen = useDeskStore((state) => state.inspectorOpen);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const [dropAnchor, setDropAnchor] = useState<IdeTabDropAnchor | null>(null);
  const tabs = group
    ? group.tabIds
        .map((id) => ws.tabs.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
    : [];
  useLayoutEffect(() => {
    const el = activeRef.current;
    if (!el) {
      return;
    }
    const viewport = el.closest('[data-slot="scroll-area-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      return;
    }
    const box = el.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    if (box.left < view.left || box.right > view.right) {
      el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }
  }, []);
  if (!group) {
    return null;
  }
  const activeId = group.activeId;
  const hasActiveTab = ws.tabs.some((t) => t.id === ws.activeId);
  return (
    <div
      role="tablist"
      className="flex h-10 shrink-0 items-center gap-1 pr-2 pl-3"
      data-testid={`ide-group-tabs-${groupId}`}
      onDragOver={(e) => {
        if (!ideDrag()) {
          return;
        }
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropAnchor(null);
        const drag = takeIdeDrag();
        if (!drag) {
          return;
        }
        useIdeStore.getState().moveTab(drag.tabId, groupId, null);
      }}
    >
      {leading ? <SidebarTrigger className="mr-1 shrink-0" /> : null}
      <ScrollArea className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <IdeTabView
              key={tab.id}
              tab={tab}
              groupId={groupId}
              isActive={tab.id === activeId}
              scrollRef={activeRef}
              dropSide={dropAnchor?.tabId === tab.id ? dropAnchor.side : null}
              onDragOverTab={(tabId, side) => setDropAnchor({ tabId, side })}
              onDragLeaveTab={() => setDropAnchor(null)}
              onSelect={() => handleSelect(tab)}
              onClose={() => handleCloseTab(tab.id)}
              menu={
                <GroupMenuItems
                  groupId={groupId}
                  targetTabId={tab.id}
                  onCloseTab={handleCloseTab}
                  onCloseGroup={handleCloseGroup}
                  onCloseAll={handleCloseAll}
                />
              }
            />
          ))}
        </div>
      </ScrollArea>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="ide-group-menu"
          title="Editor group options"
          aria-label="Editor group options"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <EllipsisIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <GroupMenuItems
            groupId={groupId}
            targetTabId={activeId}
            onCloseTab={handleCloseTab}
            onCloseGroup={handleCloseGroup}
            onCloseAll={handleCloseAll}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {trailing ? (
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="toggle-inspector"
          title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          aria-pressed={inspectorOpen}
          disabled={!hasActiveTab}
          className={cn('shrink-0', inspectorOpen && 'bg-muted text-foreground')}
          onClick={() => useDeskStore.getState().toggleInspector()}
        >
          <PanelRightIcon />
          <span className="sr-only">{inspectorOpen ? 'Hide inspector' : 'Show inspector'}</span>
        </Button>
      ) : null}
    </div>
  );
  function handleSelect(tab: (typeof tabs)[number]) {
    useIdeStore.getState().setActive(tab.id);
    if (tab.threadId) {
      const thread = useThreadStore.getState().byId(tab.threadId);
      const currentAgentId = thread?.agentId ?? tab.agentId;
      if (useDeskStore.getState().focusedThreadId !== tab.threadId) {
        useDeskStore.getState().setFocusedThreadId(tab.threadId);
      }
      if (currentAgentId) {
        setActiveThreadId(currentAgentId, tab.threadId);
      }
    }
    const path = pathForIdeTab(orgId, tab.projectId, tab);
    if (path) {
      void navigate(path);
    }
  }
  function handleCloseTab(tabId: string) {
    const before = useIdeStore.getState().workspace;
    const closing = before.tabs.find((tab) => tab.id === tabId) ?? null;
    const closingActive = before.activeId === tabId;
    useIdeStore.getState().closeTab(tabId);
    if (!closingActive) {
      return;
    }
    const after = useIdeStore.getState().workspace;
    if (after.tabs.length === 0) {
      if (closing?.kind === 'thread' && closing.agentId) {
        useAgentsDisplayStore.getState().expand(closing.agentId);
      }
      openDesk();
      return;
    }
    const next = after.tabs.find((t) => t.id === after.activeId);
    if (next) {
      handleSelect(next);
    }
  }
  function handleCloseAll() {
    useIdeStore.getState().closeAll();
    openDesk();
  }
  function handleCloseGroup() {
    useIdeStore.getState().closeGroup(groupId);
    if (useIdeStore.getState().workspace.tabs.length === 0) {
      openDesk();
    }
  }
}
function IdeTabView({
  tab,
  groupId,
  isActive,
  scrollRef,
  dropSide,
  onDragOverTab,
  onDragLeaveTab,
  onSelect,
  onClose,
  menu,
}: {
  tab: IdeTab;
  groupId: string;
  isActive: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  dropSide: 'before' | 'after' | null;
  onDragOverTab: (tabId: string, side: IdeTabDropSide) => void;
  onDragLeaveTab: () => void;
  onSelect: () => void;
  onClose: () => void;
  menu: ReactNode;
}) {
  const selected = isActive;
  const label = useTabLabel(tab);
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            ref={selected ? scrollRef : null}
            role="tab"
            tabIndex={0}
            data-testid={`ide-tab-${tab.id}`}
            data-selected={selected ? 'true' : 'false'}
            draggable
            onDragStart={(e) => {
              setIdeDrag({ tabId: tab.id, fromGroupId: groupId });
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', tab.id);
            }}
            onDragEnd={() => setIdeDrag(null)}
            onDragOver={(e) => {
              const drag = ideDrag();
              if (!drag) {
                return;
              }
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              onDragOverTab(tab.id, e.clientX > rect.left + rect.width / 2 ? 'after' : 'before');
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                onDragLeaveTab();
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragLeaveTab();
              const drag = takeIdeDrag();
              if (!drag) {
                return;
              }
              const after = dropSide === 'after';
              const { moveTab, reorderTab } = useIdeStore.getState();
              if (drag.fromGroupId === groupId) {
                reorderTab(drag.tabId, tab.id, after);
                return;
              }
              moveTab(drag.tabId, groupId, tab.id, after);
            }}
            className={cn(
              'group/tab relative flex max-w-52 shrink-0 animate-tab-enter items-center rounded-md p-0.5 pl-2 text-[0.74rem] transition-colors duration-150',
              selected
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              dropSide !== null && 'ring-1 ring-ring',
            )}
          >
            {dropSide ? (
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-y-0.5 z-20 w-0.5 rounded-full bg-ring',
                  dropSide === 'before' ? '-left-1' : '-right-1',
                )}
              />
            ) : null}
            <button
              type="button"
              className="relative flex min-w-0 flex-1 items-center gap-1.5 truncate"
              title={label}
              onClick={onSelect}
            >
              <TabIcon tab={tab} />
              {tab.kind === 'file' && tab.dirty ? (
                <span className="size-1.5 shrink-0 rounded-full bg-live" title="Unsaved" />
              ) : null}
              <span className="truncate leading-3">{label}</span>
            </button>
            <button
              type="button"
              data-testid={`ide-close-${tab.id}`}
              className={cn(
                'flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-opacity duration-150 hover:bg-background/30 hover:text-foreground',
                selected ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
              )}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Close tab"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        }
      />
      <ContextMenuContent onClick={(event) => event.stopPropagation()}>{menu}</ContextMenuContent>
    </ContextMenu>
  );
}
