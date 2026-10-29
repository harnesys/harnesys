import { cn } from '@/shared/lib/utils';

type SidebarEmptyProps = Omit<React.ComponentProps<'button'>, 'title'> & {
  title: string;
  interactive?: boolean;
  onAction?: () => void;
  testId?: string;
};

export function SidebarEmpty({
  title,
  interactive = false,
  onAction,
  testId,
  className,
  ...rest
}: SidebarEmptyProps) {
  const clickable = interactive || Boolean(onAction);
  const rootClass = cn(
    'w-full px-2 py-1.5 text-left text-muted-foreground text-xs group-data-[collapsible=icon]:hidden',
    clickable &&
      'cursor-pointer rounded-md transition-colors hover:bg-sidebar-accent/70 hover:text-foreground',
    className,
  );
  if (!clickable) {
    return (
      <div data-testid={testId} className={rootClass}>
        {title}
      </div>
    );
  }
  return (
    <button type="button" data-testid={testId} className={rootClass} onClick={onAction} {...rest}>
      {title}
    </button>
  );
}
