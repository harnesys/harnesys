import type { Agent } from '@/entities/agent';
import { useAgentStore } from '@/entities/agent';
import type { Thread } from '@/entities/thread';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { useOpenThread } from '../model/thread-actions';
import { SidebarEmpty } from './sidebar-empty';
import { ThreadKindIcon } from './thread-kind-icon';
export function InboxSection({
  threads,
  activeThreadId,
  onSelectDone,
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectDone: () => void;
}) {
  const agents = useAgentStore((state) => state.items);
  const openThread = useOpenThread();
  const seen = new Set<string>();
  const sorted = [...threads]
    .filter((thread) => {
      if (seen.has(thread.id)) {
        return false;
      }
      seen.add(thread.id);
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (sorted.length === 0) {
    return <SidebarEmpty title="No waiting items" testId="inbox-empty" />;
  }
  const agentName = (thread: Thread): string => {
    const agent: Agent | undefined = agents.find((item) => item.id === thread.agentId);
    return agent?.name ?? thread.agentId;
  };
  return (
    <div className="flex flex-col gap-0.5 pb-1">
      {sorted.map((thread) => (
        <InboxRow
          key={thread.id}
          thread={thread}
          agentName={agentName(thread)}
          selected={activeThreadId === thread.id}
          onSelect={() => {
            openThread(thread);
            onSelectDone();
          }}
        />
      ))}
    </div>
  );
}
function InboxRow({
  thread,
  agentName,
  selected,
  onSelect,
}: {
  thread: Thread;
  agentName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const timeZone = useOrgTimeZone();
  return (
    <div
      className={cn(
        'group/inbox relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`inbox-thread-${thread.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={onSelect}
            />
          }
        >
          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground group-data-[collapsible=icon]:mt-0">
            <ThreadKindIcon kind={thread.kind} className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate pr-4 text-sm leading-4">{thread.title}</span>
            <span className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground leading-4">
                {agentName} · {formatDayTime(thread.updatedAt, timeZone)}
              </span>
              {thread.lastError ? (
                <span
                  className="shrink-0 font-mono text-[8px] text-destructive"
                  title={thread.lastError.message}
                >
                  error
                </span>
              ) : (
                <span className="shrink-0 font-mono text-[8px] text-live/70">waiting</span>
              )}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          {thread.lastError ? `${thread.title} — ${thread.lastError.message}` : thread.title}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
