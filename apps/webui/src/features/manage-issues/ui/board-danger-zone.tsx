import type { IssueBoardRecord } from '@harnesys/studio-shared';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { restoreIssueBoard, setIssueBoardArchive } from '../model/boards';

export function BoardDangerZone({
  orgId,
  board,
  onArchived,
}: {
  orgId: string;
  board: IssueBoardRecord;
  onArchived: () => void;
}) {
  const [dangerBusy, setDangerBusy] = useState(false);
  const archived = board.status === 'archived';

  const archive = async (): Promise<void> => {
    if (dangerBusy) {
      return;
    }
    setDangerBusy(true);
    if (archived) {
      await restoreIssueBoard(orgId, board.id);
    } else {
      await setIssueBoardArchive(orgId, board.id);
    }
    setDangerBusy(false);
    onArchived();
  };

  return (
    <section className="space-y-2 border-t pt-4" data-testid="board-danger">
      <h4 className="font-medium text-destructive text-sm">Danger</h4>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 px-3 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">{archived ? 'Restore board' : 'Archive board'}</span>
          <span className="text-muted-foreground text-xs">
            {archived
              ? 'Bring the board back to the active list.'
              : 'Move the board out of the active list.'}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={dangerBusy}
          data-testid={archived ? 'board-restore' : 'board-archive'}
          onClick={() => void archive()}
        >
          {archived ? 'Restore' : 'Archive'}
        </Button>
      </div>
    </section>
  );
}
