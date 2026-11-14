import { CalendarClockIcon, EarthIcon, MessageSquareIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAgentStore } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
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
  identity: ThreadDockIdentity;
  threadId?: string;
  issueId?: string | null;
  settings?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-3" data-testid="thread-dock">
      <div className="overflow-hidden rounded-lg border border-border/40 bg-background">
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
        {threadId ? (
          <div className="border-border/40 border-t">
            <ThreadRunStatusBar threadId={threadId} issueId={issueId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ThreadTriggerDock({
  threadId,
  issueId,
  settings,
}: {
  threadId: string;
  issueId?: string | null;
  settings?: ReactNode;
}) {
  const thread = useThreadStore((state) => state.byId(threadId) ?? undefined);
  const agent = useAgentStore((state) =>
    thread ? (state.byId(thread.agentId) ?? undefined) : undefined,
  );
  return (
    <ThreadDock
      identity={{
        icon: <FallbackIcon kind={thread?.kind ?? 'chat'} />,
        title: thread?.title ?? '',
        meta: agent?.name,
      }}
      threadId={threadId}
      issueId={issueId}
      settings={settings}
    />
  );
}

function FallbackIcon({ kind }: { kind: string }) {
  if (kind === 'schedule') {
    return <CalendarClockIcon />;
  }
  if (kind === 'webhook') {
    return <EarthIcon />;
  }
  return <MessageSquareIcon />;
}
