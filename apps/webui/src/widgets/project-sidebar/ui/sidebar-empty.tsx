import { type LucideIcon, PlusIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

type SidebarEmptyProps = Omit<React.ComponentProps<'button'>, 'title'> & {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  variant?: 'card' | 'inline';
  interactive?: boolean;
  onAction?: () => void;
  testId?: string;
};

export function SidebarEmpty({
  title,
  hint,
  icon: Icon,
  actionLabel,
  variant = 'card',
  interactive = false,
  onAction,
  testId,
  className,
  ...rest
}: SidebarEmptyProps) {
  const clickable = interactive || Boolean(onAction);
  const rootClass = cn(
    'w-full group-data-[collapsible=icon]:hidden',
    variant === 'card'
      ? cn(
          'group/empty my-0.5 flex select-none flex-col items-center justify-center gap-1.5 rounded-lg border border-sidebar-border border-dashed px-2.5 py-3 text-center',
          clickable && 'cursor-pointer transition-colors hover:bg-sidebar-accent/40',
        )
      : cn(
          'flex select-none items-start gap-1.5 px-1.5 py-1 text-left',
          clickable &&
            'cursor-pointer rounded-md transition-colors hover:bg-sidebar-accent/70 hover:text-foreground',
        ),
    className,
  );
  const body = (
    <>
      {Icon ? (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center transition-colors',
            variant === 'card'
              ? 'size-7 rounded-full border bg-sidebar-accent/40 text-muted-foreground/50 group-hover/empty:bg-sidebar-accent group-hover/empty:text-muted-foreground'
              : 'mt-px size-3.5 text-muted-foreground/50',
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
      ) : null}
      <span className={cn('min-w-0', variant === 'card' && 'flex flex-col items-center')}>
        <span
          className={cn(
            'block font-medium',
            variant === 'card'
              ? 'text-[11px] text-sidebar-foreground/75 leading-tight'
              : 'text-[11px] text-muted-foreground leading-tight',
          )}
        >
          {title}
        </span>
        {hint ? (
          <span
            className={cn(
              'block text-[10px] text-muted-foreground/60 leading-snug',
              variant === 'card' ? 'mt-0.5 max-w-40 text-balance' : 'mt-px',
            )}
          >
            {hint}
          </span>
        ) : null}
      </span>
      {actionLabel ? (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 font-medium text-[10px] text-muted-foreground/70 transition-colors',
            variant === 'card' && 'mt-0.5',
            clickable && 'group-hover/empty:text-sidebar-foreground',
          )}
        >
          <PlusIcon className="size-3" aria-hidden />
          {actionLabel}
        </span>
      ) : null}
    </>
  );
  if (!clickable) {
    return (
      <div data-testid={testId} className={rootClass}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" data-testid={testId} className={rootClass} onClick={onAction} {...rest}>
      {body}
    </button>
  );
}
