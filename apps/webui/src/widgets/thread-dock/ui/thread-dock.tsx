import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { ThreadRunStatusBar } from '@/widgets/thread-run-status';

export interface ThreadDockIdentity {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function ThreadDock({
  identity,
  threadId,
  issueId,
  settings,
}: {
  identity?: ThreadDockIdentity;
  threadId?: string;
  issueId?: string | null;
  settings?: ReactNode;
}) {
  const showIdentity = Boolean(
    identity && (identity.icon || identity.title || identity.meta || identity.actions || settings),
  );
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-3" data-testid="thread-dock">
      <div className="overflow-hidden rounded-lg border border-border/40 bg-background">
        {showIdentity && identity ? (
          <div className="flex items-center gap-2.5 px-3 py-2">
            {identity.icon ? (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/40 text-muted-foreground [&_svg]:size-3.5">
                {identity.icon}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm leading-tight">{identity.title}</div>
              {identity.meta ? (
                <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground leading-tight">
                  {identity.meta}
                </div>
              ) : null}
            </div>
            {identity.actions}
            {settings}
          </div>
        ) : null}
        {threadId ? (
          <div className={cn(showIdentity && 'border-border/40 border-t')}>
            <ThreadRunStatusBar threadId={threadId} issueId={issueId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
