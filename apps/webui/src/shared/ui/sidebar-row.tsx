import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

const ICON_SLOT = 'flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5';

export const SIDEBAR_ROW_HEIGHT = 28;
export const SIDEBAR_FILE_ROW_HEIGHT = 26;
export const SIDEBAR_ROW_INDENT = 16;

interface SidebarRowProps extends Omit<ComponentProps<'button'>, 'className' | 'children'> {
  leading?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  variant?: 'line' | 'card';
  height?: number;
  depth?: number;
  testId?: string;
  className?: string;
  children?: ReactNode;
}

export function SidebarRow({
  leading,
  trailing,
  actions,
  selected = false,
  variant = 'line',
  height = SIDEBAR_ROW_HEIGHT,
  depth = 0,
  testId,
  className,
  children,
  ...buttonProps
}: SidebarRowProps) {
  const sizeStyle: CSSProperties = variant === 'line' ? { height } : {};
  const indentStyle: CSSProperties =
    depth > 0 ? { paddingLeft: depth * SIDEBAR_ROW_INDENT + 6 } : {};
  return (
    <div
      className={cn(
        'group/row relative flex rounded-md pl-1 transition-colors',
        selected
          ? 'bg-sidebar-accent/70 text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/70',
        className,
      )}
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          variant === 'card' && 'items-start py-1.5',
        )}
        style={{ ...sizeStyle, ...indentStyle }}
        {...buttonProps}
      >
        {leading ? <span className={ICON_SLOT}>{leading}</span> : null}
        <span className={cn('min-w-0 flex-1', variant === 'card' && 'flex flex-col')}>
          {children}
        </span>
        {trailing ? (
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground tabular-nums leading-4',
              actions && 'min-w-11 justify-end transition-opacity group-hover/row:opacity-0',
            )}
          >
            {trailing}
          </span>
        ) : null}
      </button>
      {actions ? (
        <div
          className={cn(
            'absolute inset-y-0 right-2 flex gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 has-[:focus-visible]:opacity-100',
            variant === 'card' ? 'items-start pt-1.5' : 'items-center',
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function SidebarRowTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn('block truncate text-[13px] text-sidebar-foreground/90 leading-4', className)}
    >
      {children}
    </span>
  );
}

export function SidebarRowMeta({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'block truncate text-[11px] text-muted-foreground tabular-nums leading-4',
        className,
      )}
    >
      {children}
    </span>
  );
}
