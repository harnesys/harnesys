import type { BoardStatus } from '@harnesys/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export function BoardStatusMoveDialog({
  count,
  statusKey,
  statuses,
  onMove,
  onCancel,
}: {
  count: number;
  statusKey: string;
  statuses: BoardStatus[];
  onMove: (targetKey: string) => void;
  onCancel: () => void;
}) {
  const targets = statuses.filter((status) => status.key !== statusKey);
  const [target, setTarget] = useState(targets[0]?.key ?? '');
  return (
    <div
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
      data-testid="board-status-move-dialog"
    >
      <p className="font-medium text-foreground">{count} issue(s) are in this status</p>
      <p className="mt-0.5 text-muted-foreground">Pick a status to move them to, then delete.</p>
      <div className="mt-2 flex items-center gap-1.5">
        <Select
          items={targets.map((item) => ({ value: item.key, label: item.label }))}
          value={target}
          onValueChange={(value) => value && setTarget(String(value))}
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs">
            <SelectValue placeholder="Target status" />
          </SelectTrigger>
          <SelectContent>
            {targets.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={!target}
          data-testid="board-status-move-confirm"
          onClick={() => onMove(target)}
        >
          Move & delete
        </Button>
      </div>
    </div>
  );
}
