import { cn } from '@/shared/lib/utils';
import type { SectionSignal } from '../model/section-signals';

export function SectionLiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('absolute -top-0 -left-0 flex size-1.5', className)}>
      <span className="live-dot size-1.5 rounded-full bg-live ring-2 ring-sidebar" />
    </span>
  );
}

export function SectionSignalBadge({ signal }: { signal: SectionSignal }) {
  if (signal.attention <= 0) {
    return null;
  }
  return (
    <span
      className={cn(
        'flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 font-medium text-[9px] text-white tabular-nums leading-none ring-2 ring-sidebar',
        signal.critical ? 'bg-destructive' : 'bg-live',
      )}
    >
      {signal.attention > 99 ? '99+' : signal.attention}
    </span>
  );
}
