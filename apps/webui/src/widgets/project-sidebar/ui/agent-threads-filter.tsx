import type { ThreadKind } from '@harnesys/studio-shared';
import { ListFilterIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  AGENT_THREAD_KINDS,
  useAgentsDisplayStore,
} from '@/features/desk/model/agents-display.store';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ThreadKindIcon } from './thread-kind-icon';

const KIND_META: Record<ThreadKind, { label: string; icon: ReactNode }> = {
  chat: { label: 'Chat', icon: <ThreadKindIcon kind="chat" className="size-3.5" /> },
  issue: { label: 'Issues', icon: <ThreadKindIcon kind="issue" className="size-3.5" /> },
  schedule: {
    label: 'Scheduler',
    icon: <ThreadKindIcon kind="schedule" className="size-3.5" />,
  },
  webhook: {
    label: 'Webhooks',
    icon: <ThreadKindIcon kind="webhook" className="size-3.5" />,
  },
  connector: {
    label: 'Connectors',
    icon: <ThreadKindIcon kind="connector" className="size-3.5" />,
  },
};

export function AgentThreadsFilterMenu({ agentId }: { agentId: string }) {
  const kinds = useAgentsDisplayStore(
    (state) => state.threadKindFilter[agentId] ?? AGENT_THREAD_KINDS,
  );
  const toggleKind = useAgentsDisplayStore((state) => state.toggleKind);
  const resetKinds = useAgentsDisplayStore((state) => state.resetKinds);
  const filtered = kinds.length < AGENT_THREAD_KINDS.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="Filter threads"
            data-testid={`agent-threads-filter-${agentId}`}
            className="relative"
          />
        }
        onClick={(event) => event.stopPropagation()}
      >
        <ListFilterIcon
          className={cn(
            'text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground',
            filtered && 'text-sidebar-foreground',
          )}
        />
        {filtered ? (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-live">
            <span className="sr-only">Filter active</span>
          </span>
        ) : null}
        <span className="sr-only">Filter threads</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Thread kinds</DropdownMenuLabel>
          {AGENT_THREAD_KINDS.map((kind) => (
            <DropdownMenuCheckboxItem
              key={kind}
              checked={kinds.includes(kind)}
              disabled={kinds.length === 1 && kinds.includes(kind)}
              onCheckedChange={() => toggleKind(agentId, kind)}
              data-testid={`agent-threads-filter-${agentId}-${kind}`}
            >
              {KIND_META[kind].icon}
              {KIND_META[kind].label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {filtered ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => resetKinds(agentId)}
                data-testid={`agent-threads-filter-${agentId}-reset`}
              >
                Show all
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
