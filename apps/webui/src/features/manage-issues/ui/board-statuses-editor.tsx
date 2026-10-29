import type { BoardStatus, StatusCategory } from '@harnesys/contracts';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useIssueBoardStore, useIssueStore } from '@/entities/issue';
import {
  ApiError,
  addBoardStatus,
  type IssueBoardRecord,
  listIssues,
  removeBoardStatus,
  reorderBoardStatuses,
  updateBoardStatus,
  updateIssueStatusRecord,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { sortedStatuses } from '../model/board-columns';
import { errorMessage } from '../model/issue-errors';
import { BoardStatusMoveDialog } from './board-status-move-dialog';

const CATEGORIES: { value: StatusCategory; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'started', label: 'Started' },
  { value: 'finished', label: 'Finished' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface StatusConflict {
  statusKey: string;
  count: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readConflict(error: unknown): StatusConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }
  const details = asRecord(asRecord(error.body)?.details);
  return {
    statusKey: typeof details?.statusKey === 'string' ? details.statusKey : '',
    count: typeof details?.count === 'number' ? details.count : null,
  };
}

export function BoardStatusesEditor({
  orgId,
  boardId,
  statuses,
}: {
  orgId: string;
  boardId: string;
  statuses: BoardStatus[];
}) {
  const upsertBoard = useIssueBoardStore((state) => state.upsert);
  const issues = useIssueStore((state) => state.items);
  const ordered = sortedStatuses(statuses);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [movingStatus, setMovingStatus] = useState<{ key: string; count: number } | null>(null);

  const apply = (promise: Promise<IssueBoardRecord>): void => {
    void promise.then(upsertBoard).catch((error) => {
      toast.add({
        title: 'Status update failed',
        description: errorMessage(error),
        type: 'error',
      });
    });
  };

  const add = (): void => {
    const label = newLabel.trim();
    if (!label) {
      return;
    }
    const key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!key || key.length < 2) {
      toast.add({
        title: 'Invalid status name',
        description: 'Need at least two latin characters or digits.',
        type: 'error',
      });
      return;
    }
    setAdding(false);
    setNewLabel('');
    apply(
      addBoardStatus(orgId, boardId, {
        key,
        label,
        order: ordered.length,
      }),
    );
  };

  const patch = (status: BoardStatus, input: Partial<BoardStatus>): void => {
    apply(updateBoardStatus(orgId, boardId, status.key, input));
  };

  const move = (status: BoardStatus, delta: number): void => {
    const index = ordered.indexOf(status);
    const target = index + delta;
    if (target < 0 || target >= ordered.length) {
      return;
    }
    const keys = ordered.map((item) => item.key);
    const [movedKey] = keys.splice(index, 1);
    if (!movedKey) {
      return;
    }
    keys.splice(target, 0, movedKey);
    apply(reorderBoardStatuses(orgId, boardId, keys));
  };

  const clientCount = (status: BoardStatus): number =>
    issues.filter((issue) => issue.boardId === boardId && issue.statusKey === status.key).length;

  const requestRemove = (status: BoardStatus): void => {
    void removeBoardStatus(orgId, boardId, status.key)
      .then(upsertBoard)
      .catch((error) => {
        const conflict = readConflict(error);
        if (!conflict) {
          toast.add({ title: 'Delete failed', description: errorMessage(error), type: 'error' });
          return;
        }
        setMovingStatus({
          key: conflict.statusKey || status.key,
          count: conflict.count ?? clientCount(status),
        });
      });
  };

  const moveIssuesAndRemove = (targetKey: string): void => {
    const context = movingStatus;
    setMovingStatus(null);
    if (!context || context.key === targetKey) {
      return;
    }
    void listIssues(orgId, boardId)
      .then((boardIssues) =>
        Promise.all(
          boardIssues
            .filter((issue) => issue.statusKey === context.key)
            .map((issue) => updateIssueStatusRecord(orgId, issue.id, { statusKey: targetKey })),
        ),
      )
      .then(() => removeBoardStatus(orgId, boardId, context.key))
      .then(upsertBoard)
      .catch((error) => {
        toast.add({ title: 'Delete failed', description: errorMessage(error), type: 'error' });
      });
  };

  return (
    <div className="space-y-1.5" data-testid="board-statuses-editor">
      {ordered.map((status) => (
        <div
          key={status.key}
          className="flex items-center gap-1.5 rounded-md border px-2 py-1.5"
          data-testid={`board-status-row-${status.key}`}
        >
          <input
            type="color"
            value={status.color ?? '#94a3b8'}
            onChange={(event) => patch(status, { color: event.target.value })}
            className="size-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
            aria-label={`${status.label} color`}
          />
          <Input
            defaultValue={status.label}
            onBlur={(event) => {
              const label = event.target.value.trim();
              if (label && label !== status.label) {
                patch(status, { label });
              }
            }}
            className="h-7 min-w-0 flex-1 text-xs"
            data-testid={`board-status-label-${status.key}`}
          />
          <Select
            items={CATEGORIES.map((item) => ({ value: item.value, label: item.label }))}
            value={status.category}
            onValueChange={(value) => patch(status, { category: String(value) as StatusCategory })}
          >
            <SelectTrigger size="sm" className="w-28 shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
            entry
            <Switch
              checked={status.isEntry}
              size="sm"
              aria-label={`${status.label} entry`}
              onCheckedChange={(isEntry) => patch(status, { isEntry })}
            />
          </span>
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Move up"
              onClick={() => move(status, -1)}
            >
              <ArrowUpIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Move down"
              onClick={() => move(status, 1)}
            >
              <ArrowDownIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${status.label}`}
              data-testid={`board-status-delete-${status.key}`}
              onClick={() => requestRemove(status)}
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5">
          <Input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                add();
              }
              if (event.key === 'Escape') {
                setAdding(false);
                setNewLabel('');
              }
            }}
            placeholder="Status name"
            autoFocus
            className="h-7 min-w-0 flex-1 text-xs"
            data-testid="board-status-new-name"
          />
          <Button type="button" size="sm" className="h-7" onClick={add}>
            Add
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setAdding(true)}
          data-testid="board-status-add"
        >
          <PlusIcon className="size-3" />
          Add status
        </Button>
      )}
      {movingStatus ? (
        <BoardStatusMoveDialog
          count={movingStatus.count}
          statusKey={movingStatus.key}
          statuses={ordered}
          onMove={moveIssuesAndRemove}
          onCancel={() => setMovingStatus(null)}
        />
      ) : null}
    </div>
  );
}
