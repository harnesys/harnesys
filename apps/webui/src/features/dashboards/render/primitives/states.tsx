import type { ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

export function WidgetLoadingState(): ReactNode {
  return (
    <div className="flex w-full flex-col gap-2 p-1" aria-busy="true">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

export function WidgetEmptyState({ message }: { message: string }): ReactNode {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
      {message}
    </div>
  );
}

export function WidgetPropsErrorState({
  itemId,
  message,
  detail,
}: {
  itemId: string;
  message: string;
  detail?: string;
}): ReactNode {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="font-medium text-amber-600 text-sm dark:text-amber-400">
        Invalid props for {itemId}
      </div>
      <div className="font-mono text-muted-foreground text-xs">{message}</div>
      {detail ? <div className="text-muted-foreground text-xs">{detail}</div> : null}
    </div>
  );
}

export function WidgetErrorState({
  title,
  message,
  detail,
  onRetry,
}: {
  title: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <div className="font-medium text-destructive text-sm">{title}</div>
      <div className="text-muted-foreground text-sm">{message}</div>
      {detail ? (
        <pre className="max-h-20 overflow-auto whitespace-pre-wrap rounded bg-muted px-2 py-1 font-mono text-muted-foreground text-xs">
          {detail}
        </pre>
      ) : null}
      {onRetry ? (
        <div>
          <Button variant="outline" size="xs" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
