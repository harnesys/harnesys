import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useIssueLabelStore } from '@/entities/issue';
import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { LabelPicker } from '../label-editor/label-picker';

export function IssueLabelField({
  selected,
  onChange,
  orgId,
}: {
  selected: string[];
  onChange: (labels: string[]) => void;
  orgId: string;
}) {
  const labels = useIssueLabelStore((state) => state.items);
  const [open, setOpen] = useState(false);
  const chosen = selected
    .map((id) => labels.find((label) => label.id === id))
    .filter((label): label is IssueLabelRecord => label !== undefined);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="font-medium text-muted-foreground text-xs">Labels</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className={cn(
                  'inline-flex select-none items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  open && 'bg-muted text-foreground',
                )}
                data-testid="issue-label-add"
              />
            }
          >
            <PlusIcon className="size-3" />
            Add label
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={4} className="w-64 p-1.5">
            <LabelPicker orgId={orgId} selected={selected} onChange={onChange} manage />
          </PopoverContent>
        </Popover>
      </div>
      {chosen.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="issue-label-input">
          {chosen.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
              onRemove={() => onChange(selected.filter((value) => value !== label.id))}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LabelChip({ label, onRemove }: { label: IssueLabelRecord; onRemove: () => void }) {
  return (
    <span
      className="group/chip inline-flex select-none items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[10px]"
      style={{
        backgroundColor: `${label.color}1f`,
        color: label.color,
      }}
    >
      <span className="size-1 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      {label.title}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Remove ${label.title}`}
        onClick={onRemove}
        className="-mr-0.5 flex size-3 items-center justify-center rounded opacity-0 transition-opacity hover:brightness-125 group-hover/chip:opacity-100"
        style={{ backgroundColor: `${label.color}33` }}
      >
        <XIcon className="size-2" />
      </button>
    </span>
  );
}
