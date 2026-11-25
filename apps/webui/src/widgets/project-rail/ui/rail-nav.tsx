import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import {
  SECTION_META,
  type SectionDragProps,
  SectionLiveDot,
  type SectionSignal,
  SectionSignalBadge,
  type SidebarSectionId,
} from '@/widgets/project-sidebar';
import { SECTION_TINTS } from '../model/section-tints';

export function RailNavButton({
  id,
  icon,
  signal,
  active,
  onSelect,
  dragProps,
  dragging = false,
  dropHint = null,
}: {
  id: SidebarSectionId;
  icon: ReactNode;
  signal?: SectionSignal;
  active: boolean;
  onSelect: () => void;
  dragProps?: SectionDragProps;
  dragging?: boolean;
  dropHint?: 'before' | 'after' | null;
}) {
  const label = SECTION_META[id].label;
  const status = signal
    ? [
        signal.live ? 'working now' : null,
        signal.attention > 0 ? `${signal.attention} pending` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  return (
    <div className="relative shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={status ? `${label}, ${status}` : label}
              aria-pressed={active}
              data-testid={`rail-section-${id}`}
              onClick={onSelect}
              {...dragProps}
              draggable={Boolean(dragProps)}
              className={cn(
                'relative flex size-7 shrink-0 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                active
                  ? SECTION_TINTS[id]
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                dragProps && 'cursor-grab active:cursor-grabbing',
                dragging && 'opacity-40',
              )}
            />
          }
        >
          <span className="flex items-center justify-center [&>svg]:size-4">{icon}</span>
          {signal?.attention ? (
            <span className="absolute -right-0.5 -bottom-0.5 flex">
              <SectionSignalBadge signal={signal} />
            </span>
          ) : null}
          {signal?.live ? <SectionLiveDot /> : null}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          <span className="flex flex-col">
            <span>{label}</span>
            {status ? (
              <span className="text-[10px] text-muted-foreground leading-tight">{status}</span>
            ) : null}
            {dragProps ? (
              <span className="text-[10px] text-muted-foreground/60 leading-tight">
                Drag to reorder
              </span>
            ) : null}
          </span>
        </TooltipContent>
      </Tooltip>
      {dropHint ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0.5 h-0.5 rounded-full bg-live',
            dropHint === 'before' ? '-top-[5px]' : '-bottom-[5px]',
          )}
        />
      ) : null}
    </div>
  );
}
