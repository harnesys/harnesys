import { CheckIcon, CircleIcon, CircleSlashIcon, LoaderCircleIcon, XIcon } from 'lucide-react';
import type { PlanItemStatus } from '../model/plan.store';

export function PlanStatusIcon({ status }: { status: PlanItemStatus }) {
  switch (status) {
    case 'completed':
      return <CheckIcon className="size-3.5 text-status-ok" />;
    case 'in_progress':
      return <LoaderCircleIcon className="size-3.5 animate-spin text-live" />;
    case 'failed':
      return <XIcon className="size-3.5 text-destructive" />;
    case 'cancelled':
      return <CircleSlashIcon className="size-3.5 text-muted-foreground/60" />;
    default:
      return <CircleIcon className="size-3.5 text-muted-foreground/40" />;
  }
}
