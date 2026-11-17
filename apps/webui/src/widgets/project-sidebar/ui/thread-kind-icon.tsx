import type { ThreadKind } from '@harnesys/studio-shared';
import { CalendarClockIcon, EarthIcon, MessageCircle, SquareKanbanIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ChannelIcon } from '@/shared/ui/icon';

export function threadKindInk(kind: ThreadKind): string | null {
  switch (kind) {
    case 'issue':
      return 'text-amber-500/90';
    case 'schedule':
      return 'text-sky-500/90';
    case 'webhook':
      return 'text-violet-500/90';
    case 'group':
      return null;
    case 'chat':
      return null;
  }
}

export function ThreadKindIcon({
  kind,
  className,
  icon,
  color,
}: {
  kind: ThreadKind;
  className?: string;
  icon?: string | null;
  color?: string | null;
}) {
  const ink = threadKindInk(kind);
  switch (kind) {
    case 'issue':
      return <SquareKanbanIcon className={cn(className, ink)} aria-hidden />;
    case 'schedule':
      return <CalendarClockIcon className={cn(className, ink)} aria-hidden />;
    case 'webhook':
      return <EarthIcon className={cn(className, ink)} aria-hidden />;
    case 'group':
      return <ChannelIcon icon={icon} color={color} className={className} />;
    case 'chat':
      return <MessageCircle className={cn(className, ink)} aria-hidden />;
  }
}
