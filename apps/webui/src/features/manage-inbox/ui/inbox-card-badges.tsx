import type { ApprovalStatus } from '@harnesys/contracts';
import { AlertTriangleIcon, ClockIcon } from 'lucide-react';
import { statusLabel, statusTone } from '@/entities/approval';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Badge } from '@/shared/ui/badge';
import { StatusDot } from '@/shared/ui/status-dot';

export function AgeBadge({ createdAt }: { createdAt: string }) {
  const timeZone = useOrgTimeZone();
  return (
    <Badge variant="secondary" className="ml-auto gap-1.5">
      <StatusDot tone="wait" />
      {formatDayTime(createdAt, timeZone)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <Badge variant="outline" className="ml-auto gap-1.5">
      <StatusDot tone={statusTone(status)} />
      {statusLabel(status)}
    </Badge>
  );
}

export function StaleWarning() {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-warning text-xs">
      <AlertTriangleIcon className="size-3.5 shrink-0" />
      Ask is over an hour old — action may be stale
    </div>
  );
}

export function NoDeadlineNote() {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-muted-foreground text-xs">
      <ClockIcon className="size-3.5 shrink-0" />
      No automatic deadline — this ask remains pending until it is resolved
    </div>
  );
}
