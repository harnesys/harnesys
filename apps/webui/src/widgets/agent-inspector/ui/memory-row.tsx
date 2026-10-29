import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';

interface MemoryRowProps {
  title: string;
  text: string;
  source: string;
  updatedAt: string;
  badge?: string;
  busy: boolean;
  testId?: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function MemoryRow({
  title,
  text,
  source,
  updatedAt,
  badge,
  busy,
  testId,
  onEdit,
  onDelete,
}: MemoryRowProps) {
  const timeZone = useOrgTimeZone();
  return (
    <div
      className="group/row flex items-start gap-1 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/40"
      data-testid={testId}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {badge ? (
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
              {badge}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{title}</span>
        </div>
        <p className="line-clamp-3 whitespace-pre-wrap text-[11px] text-foreground/90 leading-snug">
          {text}
        </p>
        <p className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70">
          <span className="truncate">{source}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{formatDayTime(updatedAt, timeZone)}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Edit ${title}`}
          disabled={busy}
          onClick={onEdit}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${title}`}
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}
