import { GripVerticalIcon } from 'lucide-react';
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/shared/lib/utils';
import type { GridEntry } from './grid-math';
import type { ResizeDirection } from './use-slot-interaction';

const RESIZE_DIRECTIONS: readonly ResizeDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const HANDLE_POSITION: Record<ResizeDirection, string> = {
  n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
};

export type SlotGridVariant = 'plain' | 'card';

export interface SlotGridItemProps {
  entry: GridEntry;
  /** Horizontal factor from the authored canvas width to the current one. */
  scale: number;
  editable: boolean;
  selected: boolean;
  active: boolean;
  hovered: boolean;
  variant: SlotGridVariant;
  label?: string;
  handlesOnHover?: boolean;
  className?: string;
  children: ReactNode;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick?: () => void;
  onHoverChange?: (hovered: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>, direction: ResizeDirection) => void;
}

function chromeClass(
  editable: boolean,
  selected: boolean,
  active: boolean,
  hovered: boolean,
  variant: SlotGridVariant,
): string {
  if (!editable) {
    return '';
  }
  const chosen = selected || active;
  if (variant === 'card') {
    if (chosen) {
      return 'border border-solid border-live';
    }
    return hovered ? 'border border-dashed border-live/60' : 'border border-transparent';
  }
  if (chosen) {
    return '';
  }
  return hovered
    ? 'outline outline-1 outline-offset-2 outline-live/50'
    : 'outline outline-1 outline-offset-2 outline-transparent';
}

function zIndexClass(active: boolean, selected: boolean): number {
  if (active) {
    return 40;
  }
  return selected ? 20 : 1;
}

function transitionStyle(active: boolean): string | undefined {
  return active
    ? undefined
    : 'left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease';
}

export function SlotGridItem({
  entry,
  scale,
  editable,
  selected,
  active,
  hovered,
  variant,
  label,
  handlesOnHover = true,
  className,
  children,
  onPointerDown,
  onClick,
  onHoverChange,
  onResizeStart,
}: SlotGridItemProps): ReactNode {
  const visible = selected || active || hovered;
  const showHandles = selected || active || (hovered && handlesOnHover);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: edit-mode selection target wrapped around nested controls
    <div
      className={cn(
        'absolute rounded-xl',
        editable && variant === 'card' && 'touch-none select-none',
        editable && variant === 'plain' && 'select-none',
        chromeClass(editable, selected, active, hovered, variant),
        active && 'z-40 shadow-lg',
        active && variant === 'plain' && 'outline outline-1 outline-live/50',
        className,
      )}
      data-grid-item-id={entry.id}
      data-grid-item
      data-selected={selected ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      role={editable || onClick ? 'button' : undefined}
      tabIndex={editable || onClick ? 0 : undefined}
      style={{
        left: entry.rect.x * scale,
        top: entry.rect.y,
        width: entry.rect.w * scale,
        height: entry.rect.h,
        zIndex: zIndexClass(active, selected),
        transition: transitionStyle(active),
      }}
      onPointerDown={editable ? onPointerDown : undefined}
      onPointerEnter={editable ? () => onHoverChange?.(true) : undefined}
      onPointerLeave={editable ? () => onHoverChange?.(false) : undefined}
      onClick={
        onClick
          ? (event) => {
              event.stopPropagation();
              onClick();
            }
          : undefined
      }
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onClick();
              }
            }
          : undefined
      }
    >
      <div
        className={cn('relative h-full w-full', variant === 'card' && 'overflow-hidden rounded-xl')}
      >
        {children}
      </div>
      {editable && variant === 'card' && visible ? <ItemLabel label={label ?? entry.id} /> : null}
      {editable && showHandles ? <ResizeHandles onResizeStart={onResizeStart} /> : null}
    </div>
  );
}

function ItemLabel({ label }: { label: string }): ReactNode {
  return (
    <div className="pointer-events-none absolute top-1 right-1 z-20 flex max-w-[70%] items-center gap-1 rounded border border-live/40 bg-background/95 px-1 py-0.5 text-[10px] text-muted-foreground shadow-sm">
      <GripVerticalIcon className="size-3 shrink-0 text-live" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function ResizeHandles({
  onResizeStart,
}: {
  onResizeStart: (event: ReactPointerEvent<HTMLElement>, direction: ResizeDirection) => void;
}): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {RESIZE_DIRECTIONS.map((direction) => (
        <div
          key={direction}
          data-grid-resize={direction}
          aria-hidden="true"
          className={cn(
            'pointer-events-auto absolute size-[5px] touch-none rounded-[1px] bg-live/80 after:absolute after:-inset-1 after:content-[""]',
            HANDLE_POSITION[direction],
          )}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onResizeStart(event, direction);
          }}
        />
      ))}
    </div>
  );
}
