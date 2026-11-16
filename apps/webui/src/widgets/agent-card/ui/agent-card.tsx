import { CogIcon, MessageCirclePlusIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Agent, AgentStatus } from '@/entities/agent';
import { AgentRecordAvatar, statusLabel } from '@/entities/agent';
import { useAgentHasUnread, useAgentLiveStatus } from '@/features/desk';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onSelect: () => void;
  onSettings: () => void;
  onNewThread?: () => void;
  threadsFilter?: ReactNode;
}
export function AgentCard({
  agent,
  selected,
  onSelect,
  onSettings,
  onNewThread,
  threadsFilter,
}: AgentCardProps) {
  const status = useAgentLiveStatus(agent.id);
  const hasUnread = useAgentHasUnread(agent.id);
  return (
    <div
      className={cn(
        'group/agent relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
      data-testid={`agent-card-${agent.id}`}
      data-selected={selected ? 'true' : 'false'}
      data-unread={hasUnread ? 'true' : 'false'}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={onSelect}
      >
        <div className="relative inline-flex size-[18px] shrink-0">
          <AgentRecordAvatar agent={agent} className="size-[18px]" />
          {hasUnread ? (
            <span
              title="Unread messages"
              className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-live ring-2 ring-sidebar"
            >
              <span className="sr-only">Unread messages</span>
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm leading-4',
            status === 'offline' && 'text-muted-foreground',
            hasUnread && 'font-medium',
          )}
        >
          {agent.name}
        </span>
      </button>
      <div
        className={cn(
          'shrink-0 pr-2 font-mono text-[8px] transition-opacity group-hover/agent:opacity-0',
          statusInk(status),
        )}
      >
        {statusLabel(status)}
      </div>
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/agent:opacity-100 has-[:focus-visible]:opacity-100 has-[[data-popup-open]]:opacity-100">
        {onNewThread ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="New thread"
            data-testid={`agent-new-thread-${agent.id}`}
            onClick={(event) => {
              event.stopPropagation();
              onNewThread();
            }}
          >
            <MessageCirclePlusIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
            <span className="sr-only">New thread</span>
          </Button>
        ) : null}
        {threadsFilter}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Configure agent"
          data-testid={`agent-config-${agent.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onSettings();
          }}
        >
          <CogIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          <span className="sr-only">Configure agent</span>
        </Button>
      </div>
    </div>
  );
}
function statusInk(status: AgentStatus): string {
  switch (status) {
    case 'running':
      return 'text-live';
    case 'waiting':
      return 'text-live/70';
    case 'error':
      return 'text-destructive';
    case 'offline':
      return 'text-muted-foreground/70';
    case 'idle':
      return 'text-muted-foreground';
  }
}
