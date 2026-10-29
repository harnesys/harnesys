import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RowHeader } from '@/shared/ui/capability-rows';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Skeleton } from '@/shared/ui/skeleton';
import { Switch } from '@/shared/ui/switch';

export function SettingsSection({
  label,
  count,
  description,
  actions,
  className,
  testId,
  children,
}: {
  label: string;
  count?: number;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2', className)} data-testid={testId}>
      <RowHeader label={label} count={count} description={description}>
        {actions}
      </RowHeader>
      {children}
    </section>
  );
}

export function SettingsField({
  label,
  description,
  error,
  htmlFor,
  className,
  testId,
  children,
}: {
  label: string;
  description?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 border-border/40 border-b py-2 last:border-b-0 sm:flex-row sm:items-start sm:gap-6',
        className,
      )}
      data-invalid={error ? true : undefined}
      data-testid={testId}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="font-medium text-sm leading-5">
          {label}
        </label>
        {description ? (
          <p className="text-muted-foreground text-xs leading-4">{description}</p>
        ) : null}
        {error ? <p className="text-destructive text-xs leading-4">{error}</p> : null}
      </div>
      <div className="flex min-w-0 max-w-md flex-[1.4] justify-end">{children}</div>
    </div>
  );
}

export function SettingsToggle({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
  id,
  testId,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  testId?: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-4 border-border/60 border-b py-2 last:border-b-0"
      data-testid={testId}
    >
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            onCheckedChange(!checked);
          }
        }}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 text-left"
      >
        <span id={id ? `${id}-label` : undefined} className="font-medium text-sm leading-5">
          {label}
        </span>
        {description ? (
          <span className="text-muted-foreground text-xs leading-4">{description}</span>
        ) : null}
      </button>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-labelledby={id ? `${id}-label` : undefined}
      />
    </div>
  );
}

export function SettingsSave({
  dirty,
  pending = false,
  invalid = false,
  saveLabel = 'Save',
  pendingLabel = 'Saving...',
  onSave,
  onDiscard,
  testId,
}: {
  dirty: boolean;
  pending?: boolean;
  invalid?: boolean;
  saveLabel?: string;
  pendingLabel?: string;
  onSave: () => void;
  onDiscard?: () => void;
  testId?: string;
}) {
  if (!dirty) {
    return null;
  }
  return (
    <div className="flex items-center gap-1" data-testid={testId}>
      {onDiscard ? (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onDiscard}>
          Discard
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={!dirty || invalid || pending}
        onClick={onSave}
        data-testid={testId ? `${testId}-submit` : undefined}
      >
        {pending ? pendingLabel : saveLabel}
      </Button>
    </div>
  );
}

export function SettingsEmpty({
  title,
  description,
  action,
  className,
  testId,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Empty className={cn('min-h-0 border-0 py-8', className)} data-testid={testId}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action}
    </Empty>
  );
}

export function SettingsErrorBanner({
  message,
  onRetry,
  testId,
}: {
  message: ReactNode;
  onRetry?: () => void;
  testId?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
      data-testid={testId}
    >
      <div className="min-w-0 text-destructive text-sm">{message}</div>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function SettingsWarnBanner({
  title,
  children,
  testId,
}: {
  title: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md border border-status-warn/40 bg-status-warn/10 px-3 py-2"
      data-testid={testId}
    >
      <p className="font-medium text-sm text-status-warn">{title}</p>
      {children ? <div className="text-foreground text-xs">{children}</div> : null}
    </div>
  );
}

export function RowListSkeleton({ rows = 3, testId }: { rows?: number; testId?: string }) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-1.5">
          <Skeleton className="size-3.5 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsOptionGrid({
  children,
  columns = 'auto-fill',
  minWidth = '10rem',
  className,
  testId,
}: {
  children: ReactNode;
  columns?: 'auto-fill' | 3;
  minWidth?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn('grid gap-2', columns === 3 && 'grid-cols-3', className)}
      style={
        columns === 'auto-fill'
          ? { gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))` }
          : undefined
      }
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function DangerZone({
  title,
  description,
  layout = 'row',
  children,
  className,
  testId,
}: {
  title: string;
  description?: ReactNode;
  layout?: 'row' | 'stack';
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3',
        layout === 'row'
          ? 'flex flex-wrap items-center justify-between gap-3'
          : 'flex flex-col gap-3',
        className,
      )}
      data-testid={testId}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">{title}</span>
        {description ? <span className="text-muted-foreground text-xs">{description}</span> : null}
      </div>
      {children ? (
        <div
          className={cn(
            'flex shrink-0 flex-wrap items-center gap-2',
            layout === 'stack' && 'w-full max-w-md shrink',
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
