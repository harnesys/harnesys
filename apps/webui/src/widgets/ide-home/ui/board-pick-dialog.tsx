import type { IssueBoardRecord } from '@harnesys/studio-shared';
import { resolveBoardIcon } from '@/features/manage-issues';
import { entityColorTintClass } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';

function BoardPickDialog({
  data,
  onResolve,
}: DialogComponentProps<string | null, { boards: IssueBoardRecord[] }>) {
  const boards = data?.boards ?? [];
  return (
    <div className="flex flex-col gap-1" data-testid="board-pick-dialog">
      {boards.map((board) => {
        const BoardIcon = resolveBoardIcon(board.icon);
        return (
          <button
            key={board.id}
            type="button"
            data-testid={`board-pick-${board.id}`}
            className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            onClick={() => onResolve?.(board.id)}
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-md',
                entityColorTintClass(board.color),
              )}
            >
              <BoardIcon className="size-3.5" />
            </span>
            <span className="truncate">{board.name}</span>
          </button>
        );
      })}
    </div>
  );
}
export function pickBoard(boards: IssueBoardRecord[]): Promise<string | null> {
  if (boards.length === 0) {
    return Promise.resolve(null);
  }
  if (boards.length === 1) {
    return Promise.resolve(boards[0]?.id ?? null);
  }
  return dialog.open(BoardPickDialog, {
    title: 'Choose board',
    description: 'The new issue is created on this board.',
    testId: 'board-pick',
    data: { boards },
  });
}
