import { CogIcon, PlusIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useIssueBoardStore, useIssueStore } from '@/entities/issue';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useIdeStore } from '@/features/ide';
import {
  createBoardFromTemplate,
  openBoardPresetDialog,
  openBoardSettingsDialog,
  resolveBoardIcon,
} from '@/features/manage-issues';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { entityColorTintClass, entityColorTintStyle } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useSidebar } from '@/shared/ui/sidebar';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { SidebarEmpty } from './sidebar-empty';

export function IssuesSection({
  activeBoardId,
  onSelectDone,
  loading = false,
}: {
  activeBoardId: string | null;
  onSelectDone: () => void;
  loading?: boolean;
}) {
  const orgId = useOrgId() ?? '';
  const boards = useIssueBoardStore((state) => state.boards);
  const issueCount = useIssueStore(
    (state) => state.items.filter((item) => item.parentIssueId === null).length,
  );
  const { openBoard, openDesk } = useStudioNavigation();
  const startCreation = useStartBoardCreation();
  const sorted = [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {sorted.map((board) => (
        <IssueBoardRow
          key={board.id}
          boardId={board.id}
          name={board.name}
          icon={board.icon}
          color={board.color}
          selected={activeBoardId === board.id}
          onSelect={() => {
            openBoard(board.id);
            onSelectDone();
          }}
          onSettings={() => {
            void openBoardSettingsDialog(orgId, board.id).then((result) => {
              if (result === 'removed') {
                const wasActive = activeBoardId === board.id;
                useIdeStore.getState().closeByEntity(orgId, 'board', board.id);
                if (wasActive) {
                  openDesk();
                }
              }
            });
          }}
        />
      ))}
      {sorted.length === 0 ? <BoardsEmptyState loading={loading} onCreate={startCreation} /> : null}
      <span className="sr-only" data-issue-count={issueCount} />
    </div>
  );
}

function useIssueCountForBoard(boardId: string): number {
  return useIssueStore((state) => state.items.filter((item) => item.boardId === boardId).length);
}

function useBoardHasActiveIssue(boardId: string): boolean {
  const issueIds = useIssueStore(
    useShallow((state) =>
      state.items.filter((item) => item.boardId === boardId).map((item) => item.id),
    ),
  );
  const threads = useThreadStore(useShallow((state) => state.items));
  return useSessionStore(
    useShallow((state) =>
      threads.some(
        (thread) =>
          thread.issueId !== undefined &&
          thread.issueId !== null &&
          issueIds.includes(thread.issueId) &&
          Boolean(state.activeRuns[thread.id]),
      ),
    ),
  );
}

function IssueBoardRow({
  boardId,
  name,
  icon,
  color,
  selected,
  onSelect,
  onSettings,
}: {
  boardId: string;
  name: string;
  icon: string;
  color: string | null;
  selected: boolean;
  onSelect: () => void;
  onSettings: () => void;
}) {
  const { state, isMobile } = useSidebar();
  const iconMode = state === 'collapsed' && !isMobile;
  const count = useIssueCountForBoard(boardId);
  const active = useBoardHasActiveIssue(boardId);
  const BoardIcon = resolveBoardIcon(icon);
  return (
    <div
      className={cn(
        'group/board relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`issue-board-${boardId}`}
      data-selected={selected ? 'true' : 'false'}
      data-active-issue={active ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={onSelect}
            />
          }
        >
          <span
            className={cn(
              'relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md group-data-[collapsible=icon]:mt-0',
              entityColorTintClass(color),
            )}
            style={entityColorTintStyle(color)}
          >
            <BoardIcon className="size-3.5" />
            {active ? (
              <span
                title="Issues running"
                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-orange-500 ring-2 ring-sidebar"
                data-testid={`issue-board-active-${boardId}`}
              >
                <span className="sr-only">Issues running</span>
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm leading-4">{name}</span>
            <span className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground leading-4">
                {count} {count === 1 ? 'issue' : 'issues'}
              </span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!iconMode}>
          {active ? `${name} · running` : name}
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1 right-1 opacity-0 group-hover/board:opacity-100 group-data-[collapsible=icon]:hidden"
        title="Configure board"
        data-testid={`issue-board-config-${boardId}`}
        onClick={(event) => {
          event.stopPropagation();
          onSettings();
        }}
      >
        <CogIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">Configure board</span>
      </Button>
    </div>
  );
}

function BoardsEmptyState({ loading, onCreate }: { loading: boolean; onCreate: () => void }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1 px-1 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  return <SidebarEmpty title="No boards yet" onAction={onCreate} testId="issue-board-empty" />;
}

export function IssuesSectionActions() {
  const startCreation = useStartBoardCreation();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      data-testid="issue-board-create"
      title="New board"
      onClick={startCreation}
    >
      <PlusIcon />
      <span className="sr-only">New board</span>
    </Button>
  );
}

function useStartBoardCreation(): () => void {
  const orgId = useOrgId() ?? '';
  const { openBoard } = useStudioNavigation();
  return () => {
    if (!orgId) {
      return;
    }
    void openBoardPresetDialog(orgId).then((template) => {
      if (!template) {
        return;
      }
      return createBoardFromTemplate(orgId, template).then((boardId) => {
        if (boardId) {
          openBoard(boardId);
        }
      });
    });
  };
}
