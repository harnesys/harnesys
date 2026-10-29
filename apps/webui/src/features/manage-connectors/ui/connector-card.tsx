import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export const CONNECTOR_CARD_CLASSES =
  'rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10';

export const CONNECTOR_INSET_CLASSES = 'rounded-lg bg-background ring-1 ring-foreground/5';

export function ConnectorCard({
  className,
  testId,
  children,
}: {
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(CONNECTOR_CARD_CLASSES, className)} data-testid={testId}>
      {children}
    </div>
  );
}

export function ConnectorCardRow({
  label,
  description,
  actions,
  className,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-sm">{label}</span>
        {description ? (
          <span className="text-muted-foreground text-xs leading-4">{description}</span>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      {children}
    </div>
  );
}
