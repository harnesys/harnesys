import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface PageHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ icon, title, badge, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-2.5 border-border/40 border-b px-3 py-2',
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-sm leading-5">{title}</span>
          {badge}
        </div>
        {subtitle ? (
          <div className="truncate text-[11px] text-muted-foreground leading-4">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

export function PageHeaderIcon({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md bg-muted-foreground/10 text-muted-foreground',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}
