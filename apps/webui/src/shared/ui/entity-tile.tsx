import type { ReactNode } from 'react';
import { softTint } from '@/shared/lib/color';
import { cn } from '@/shared/lib/utils';

const MARK_BOX = { sm: 'size-8', md: 'size-10', lg: 'size-12' } as const;

interface EntityMarkProps {
  icon: ReactNode;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  testId?: string;
}

export function EntityMark({ icon, color, size = 'md', className, testId }: EntityMarkProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border',
        color ? 'border-transparent' : 'bg-background text-muted-foreground',
        MARK_BOX[size],
        className,
      )}
      style={color ? { backgroundColor: softTint(color), color } : undefined}
      data-testid={testId}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

interface EntityTileProps {
  children: ReactNode;
  className?: string;
  testId?: string;
  onClick?: () => void;
  selected?: boolean;
  pressed?: boolean;
  expanded?: boolean;
}

export function EntityTile({
  children,
  className,
  testId,
  onClick,
  selected = false,
  pressed,
  expanded,
}: EntityTileProps) {
  const classes = cn(
    'group/tile flex min-w-0 flex-col gap-3 rounded-xl bg-popover p-3.5 text-left ring-1 ring-foreground/10 transition-[background-color,box-shadow] duration-150',
    onClick &&
      'outline-none hover:bg-accent/40 hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/50',
    selected && 'bg-accent/40 ring-2 ring-live',
    className,
  );
  if (!onClick) {
    return (
      <div className={classes} data-testid={testId}>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      data-testid={testId}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface EntityTileHeadProps {
  mark: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EntityTileHead({
  mark,
  title,
  subtitle,
  badges,
  description,
  action,
}: EntityTileHeadProps) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {mark}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium text-sm">{title}</span>
          {badges ? <span className="flex shrink-0 items-center gap-1">{badges}</span> : null}
        </div>
        {subtitle ? (
          <span className="truncate font-mono text-[11px] text-muted-foreground">{subtitle}</span>
        ) : null}
        {description ? (
          <span className="line-clamp-2 text-[13px] text-muted-foreground">{description}</span>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface EntityTileFooterProps {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EntityTileFooter({ children, action, className }: EntityTileFooterProps) {
  return (
    <div
      className={cn(
        'mt-auto flex min-w-0 flex-wrap items-center justify-between gap-2 border-border/40 border-t pt-2.5',
        className,
      )}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">{children}</span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}
