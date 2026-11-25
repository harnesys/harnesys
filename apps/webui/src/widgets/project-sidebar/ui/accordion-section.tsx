import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { useAccordionStore } from '../model/accordion.store';
import type { SectionSignal } from '../model/section-signals';
import { SectionSignalBadge } from './section-signal';

interface AccordionSectionProps {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  signal?: SectionSignal;
  badge?: ReactNode;
  actions?: ReactNode;
  size: number;
  children: ReactNode;
  resizer?: ReactNode;
  headerDragProps?: HTMLAttributes<HTMLButtonElement>;
  dragging?: boolean;
  dropHint?: 'before' | 'after' | null;
  horizontalScroll?: boolean;
}
export function AccordionSection({
  id,
  icon,
  title,
  signal,
  badge,
  actions,
  size,
  children,
  resizer = null,
  headerDragProps,
  dragging = false,
  dropHint = null,
  horizontalScroll = false,
}: AccordionSectionProps) {
  const collapsed = useAccordionStore((state) => state.collapsed[id] ?? false);
  const toggle = useAccordionStore((state) => state.toggle);
  const shown = !collapsed;
  const signalBadge = signal ? <SectionSignalBadge signal={signal} /> : null;
  const indicator = badge ?? signalBadge;
  const hasIndicator = Boolean(indicator);
  const hasTrailing = hasIndicator || Boolean(actions);
  return (
    <div className="group/section contents">
      <div
        className={cn(
          'group/head flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1 transition-colors',
          'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          dragging && 'cursor-grabbing opacity-50!',
          dropHint === 'before' && 'shadow-[inset_0_2px_0_0_var(--color-live)]',
          dropHint === 'after' && 'shadow-[inset_0_-2px_0_0_var(--color-live)]',
        )}
      >
        <button
          type="button"
          {...headerDragProps}
          onClick={() => toggle(id)}
          aria-expanded={shown}
          className={cn(
            'flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            headerDragProps && 'cursor-grab select-none',
          )}
        >
          <span className="mr-0.5 flex shrink-0 items-center justify-center [&>svg]:size-4">
            {icon}
          </span>
          <span className="truncate font-medium text-[13px]">{title}</span>
        </button>
        {hasTrailing ? (
          <span
            className={cn(
              'relative ml-auto flex h-7 shrink-0 items-center justify-end',
              actions &&
                hasIndicator &&
                'group-hover/head:[&>[data-section-indicator]]:opacity-0 has-data-open:[&>[data-section-indicator]]:opacity-0',
            )}
          >
            {indicator ? <span data-section-indicator="">{indicator}</span> : null}
            {actions ? (
              <span
                className={cn(
                  'pointer-events-none flex items-center opacity-0 transition-opacity',
                  'group-hover/head:pointer-events-auto group-hover/head:opacity-100',
                  'has-data-open:pointer-events-auto has-data-open:opacity-100',
                  hasIndicator && 'absolute inset-y-0 right-0',
                )}
              >
                {actions}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {shown ? (
        <>
          {resizer}
          <ScrollArea
            data-accordion-content={id}
            horizontal={horizontalScroll}
            style={{ flexGrow: size, flexBasis: 0 }}
            className="min-h-0"
          >
            {children}
          </ScrollArea>
        </>
      ) : null}
    </div>
  );
}
