import { cn } from '@/shared/lib/utils';
import { SIDEBAR_ROW_INDENT } from '@/shared/ui/sidebar-row';
import { Spinner } from '@/shared/ui/spinner';

export function SourceTreeStatus({
  preparing,
  failed,
  depthOffset,
}: {
  preparing: boolean;
  failed: boolean;
  depthOffset: number;
}) {
  if (preparing) {
    return (
      <div
        className="flex h-7 items-center gap-1.5 text-muted-foreground"
        style={{ paddingLeft: `${depthOffset * SIDEBAR_ROW_INDENT + 22}px` }}
      >
        <Spinner className="size-4" />
        <span className="text-[11px]">Preparing source...</span>
      </div>
    );
  }
  return (
    <p
      className={cn(
        'flex h-7 items-center text-[11px]',
        failed ? 'text-destructive' : 'text-muted-foreground',
      )}
      style={{ paddingLeft: `${depthOffset * SIDEBAR_ROW_INDENT + 6}px` }}
    >
      {failed ? 'Source is unavailable.' : 'Empty source.'}
    </p>
  );
}
