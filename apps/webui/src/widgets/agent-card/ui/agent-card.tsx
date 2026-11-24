import { CogIcon, MessageCirclePlusIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Agent, AgentStatus } from '@/entities/agent';
import { AgentRecordAvatar, statusLabel } from '@/entities/agent';
import { useAgentHasUnread, useAgentLiveStatus } from '@/features/desk';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { SidebarRow, SidebarRowTitle } from '@/shared/ui/sidebar-row';

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onSelect: () => void;
  onSettings: () => void;
  onNewThread?: () => void;
  threadsFilter?: ReactNode;
  moveAction?: ReactNode;
  avatarHighlight?: boolean;
}
export function AgentCard({
  agent,
  selected,
  onSelect,
  onSettings,
  onNewThread,
  threadsFilter,
  moveAction,
  avatarHighlight,
}: AgentCardProps) {
  const status = useAgentLiveStatus(agent.id);
  const hasUnread = useAgentHasUnread(agent.id);
  return (
    <SidebarRow
      testId={`agent-card-${agent.id}`}
      selected={selected}
      className="pl-1"
      data-unread={hasUnread ? 'true' : 'false'}
      leading={
        <span
          title={avatarHighlight ? 'Department lead' : undefined}
          className={cn(
            'relative inline-flex size-[18px] shrink-0 rounded-full',
            avatarHighlight && 'ring-2 ring-live/40',
          )}
        >
          <AgentRecordAvatar agent={agent} className="size-[18px]" />
          {hasUnread ? (
            <span
              title="Unread messages"
              className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-live ring-2 ring-sidebar"
            >
              <span className="sr-only">Unread messages</span>
            </span>
          ) : null}
        </span>
      }
      trailing={
        <span className={cn('font-mono text-[10px]', statusInk(status))}>
          {statusLabel(status)}
        </span>
      }
      actions={
        <>
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
          {moveAction}
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
        </>
      }
      onClick={onSelect}
    >
      <SidebarRowTitle
        className={cn(
          'ml-0.5',
          status === 'offline' && 'text-muted-foreground',
          hasUnread && 'font-medium',
        )}
      >
        {agent.name}
      </SidebarRowTitle>
    </SidebarRow>
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
