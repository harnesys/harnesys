import { KanbanIcon, ListIcon, PlusIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useIssueBoardStore, useIssueLabelStore, useIssueStore } from '@/entities/issue';
import { useOrgId } from '@/shared/config/location';
import { entityColorTintClass } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { resolveBoardIcon } from '../model/board-icons';
import { useIssueDrawerStore } from '../model/issue-drawer.store';
import { applyIssueFilters, sortIssues } from '../model/issue-filters';
import type { IssueViewMode } from '../model/issue-view.store';
import { useBoardViewSettings, useIssueViewStore } from '../model/issue-view.store';
import { BoardColumnsPopover } from './board-columns-popover';
import { BoardFilterPopover } from './board-filter-popover';
import { BoardKanban } from './board-kanban';
import { BoardList } from './board-list';
import { BoardSortPopover } from './board-sort-popover';
import { IssueDrawer } from './issue-drawer';

export function BoardSurface({ projectId, boardId }: { projectId: string; boardId: string }) {
  const orgId = useOrgId() ?? projectId;
  const board = useIssueBoardStore((state) => state.boardById(boardId));
  const items = useIssueStore((state) => state.items);
  const labels = useIssueLabelStore((state) => state.items);
  const agents = useAgentStore(
    useShallow((state) => state.items.filter((agent) => agent.orgId === orgId)),
  );
  const settings = useBoardViewSettings(boardId);
  const setViewMode = (mode: IssueViewMode) =>
    useIssueViewStore.getState().patch(boardId, { mode });
  const startCreate = useIssueDrawerStore((state) => state.startCreate);
  if (!board) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Board not found
      </div>
    );
  }
  const statuses = board.statuses;
  const archived = board.status === 'archived';
  const boardIssues = items.filter((issue) => issue.boardId === boardId);
  const filtered = applyIssueFilters(boardIssues, settings.filters);
  const entryStatus = statuses.find((status) => status.isEntry);
  const IssueIcon = resolveBoardIcon(board.icon);
  const colorClass = entityColorTintClass(board.color ?? null);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-board">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span
          className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', colorClass)}
        >
          <IssueIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-sm">{board.name}</span>
            {archived ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground uppercase">
                Archived
              </span>
            ) : null}
          </div>
          {board.description ? (
            <div className="truncate text-[11px] text-muted-foreground">{board.description}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ToggleGroup
            size="sm"
            variant="segment"
            value={[settings.mode]}
            onValueChange={(value) => {
              const next = value[0];
              if (next === 'kanban' || next === 'list') {
                setViewMode(next);
              }
            }}
            aria-label="Board view"
          >
            <ToggleGroupItem value="kanban" data-testid="issue-view-kanban">
              <KanbanIcon className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" data-testid="issue-view-list">
              <ListIcon className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
          <BoardSortPopover
            sort={settings.sort}
            onToggle={(field) => useIssueViewStore.getState().setSort(boardId, field)}
          />
          <BoardColumnsPopover
            statuses={statuses}
            hiddenStatuses={settings.hiddenStatuses}
            onPatch={(hiddenStatuses) =>
              useIssueViewStore.getState().patch(boardId, { hiddenStatuses })
            }
          />
          <BoardFilterPopover
            filters={settings.filters}
            statuses={statuses}
            agents={agents}
            onPatch={(patch) => useIssueViewStore.getState().setFilters(boardId, patch)}
          />
          {!archived ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              data-testid="issue-create-open"
              onClick={() => {
                if (!entryStatus) {
                  toast.add({
                    title: 'No entry status',
                    description: 'Mark a status as entry in board settings before creating issues.',
                    type: 'error',
                  });
                  return;
                }
                startCreate(boardId, entryStatus.key);
              }}
            >
              <PlusIcon className="size-3.5" />
              New issue
            </Button>
          ) : null}
        </div>
      </div>
      {settings.mode === 'kanban' ? (
        <BoardKanban
          boardId={boardId}
          issues={filtered}
          statuses={statuses}
          rules={board.rules}
          agents={agents}
          orgId={orgId}
          hiddenStatuses={settings.hiddenStatuses}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <BoardList
            issues={sortIssues(
              filtered.filter((issue) => !settings.hiddenStatuses.includes(issue.statusKey)),
              settings.sort,
              statuses,
            )}
            statuses={statuses}
            labels={labels}
            agents={agents}
            orgId={orgId}
            sortField={settings.sort.field}
            sortOrder={settings.sort.order}
            onToggleSort={(field) => useIssueViewStore.getState().setSort(boardId, field)}
          />
        </div>
      )}
      <IssueDrawer orgId={orgId} />
    </div>
  );
}
