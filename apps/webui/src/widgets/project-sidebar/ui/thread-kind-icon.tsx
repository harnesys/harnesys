import type { ThreadKind } from '@harnesys/studio-shared';
import {
  CalendarClockIcon,
  EarthIcon,
  MessageCircle,
  SendIcon,
  SquareKanbanIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export function threadKindInk(kind: ThreadKind): string | null {
  switch (kind) {
    case 'issue':
      return 'text-amber-500/90';
    case 'schedule':
      return 'text-sky-500/90';
    case 'webhook':
      return 'text-violet-500/90';
    case 'connector':
      return 'text-sky-400/90';
    case 'chat':
      return null;
  }
}

export function ThreadKindIcon({ kind, className }: { kind: ThreadKind; className?: string }) {
  const ink = threadKindInk(kind);
  switch (kind) {
    case 'issue':
      return <SquareKanbanIcon className={cn(className, ink)} aria-hidden />;
    case 'schedule':
      return <CalendarClockIcon className={cn(className, ink)} aria-hidden />;
    case 'webhook':
      return <EarthIcon className={cn(className, ink)} aria-hidden />;
    case 'connector':
      return <SendIcon className={cn(className, ink)} aria-hidden />;
    case 'chat':
      return <MessageCircle className={cn(className, ink)} aria-hidden />;
  }
}
