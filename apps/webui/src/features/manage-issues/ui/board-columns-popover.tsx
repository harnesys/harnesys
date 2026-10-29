import type { BoardStatus } from '@harnesys/studio-shared';
import { Columns3Icon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Switch } from '@/shared/ui/switch';
import { sortedStatuses } from '../model/board-columns';

function ColumnRow({
  status,
  visible,
  onToggle,
}: {
  status: BoardStatus;
  visible: boolean;
  onToggle: (visible: boolean) => void;
}) {
  const testId = `issue-columns-${status.key}`;
  return (
    <label
      htmlFor={testId}
      className="flex cursor-default select-none items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden focus-within:bg-accent focus-within:text-accent-foreground hover:bg-accent hover:text-accent-foreground"
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: status.color ?? '#94a3b8' }}
      />
      <span className="flex-1 text-xs">{status.label}</span>
      <Switch
        id={testId}
        size="sm"
        checked={visible}
        data-testid={testId}
        onCheckedChange={(value) => onToggle(value)}
      />
    </label>
  );
}

export function BoardColumnsPopover({
  statuses,
  hiddenStatuses,
  onPatch,
}: {
  statuses: BoardStatus[];
  hiddenStatuses: string[];
  onPatch: (hiddenStatuses: string[]) => void;
}) {
  const toggle = (key: string) => {
    onPatch(
      hiddenStatuses.includes(key)
        ? hiddenStatuses.filter((item) => item !== key)
        : [...hiddenStatuses, key],
    );
  };
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Columns3Icon />
            Columns
            {hiddenStatuses.length > 0 ? (
              <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">
                {hiddenStatuses.length}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={4} className="w-56 p-1">
        {sortedStatuses(statuses).map((status: BoardStatus) => (
          <ColumnRow
            key={status.key}
            status={status}
            visible={!hiddenStatuses.includes(status.key)}
            onToggle={() => toggle(status.key)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
