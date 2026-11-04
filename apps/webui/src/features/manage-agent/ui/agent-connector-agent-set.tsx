import type { ThreadMember } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, XIcon } from 'lucide-react';
import { orgScopedAgentsQuery } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export function ConnectorAgentSet({
  orgId,
  agents,
  disabled,
  onAdd,
  onRemove,
}: {
  orgId: string;
  agents: ThreadMember[];
  disabled: boolean;
  onAdd: (agentId: string) => void;
  onRemove: (agentId: string) => void;
}) {
  const orgAgents = useQuery(orgScopedAgentsQuery(orgId));
  const memberIds = new Set(agents.map((agent) => agent.id));
  const candidates = (orgAgents.data?.items ?? []).filter((agent) => !memberIds.has(agent.id));

  return (
    <div className="flex flex-col gap-1.5" data-testid="connector-agent-set">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Agents</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {agents.map((agent) => (
          <span
            key={agent.id}
            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
          >
            {agent.name}
            <button
              type="button"
              aria-label={`Remove ${agent.name}`}
              className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
              disabled={disabled || agents.length <= 1}
              onClick={() => onRemove(agent.id)}
            >
              <XIcon className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5"
                disabled={disabled || candidates.length === 0}
              />
            }
          >
            <PlusIcon className="size-3.5" aria-hidden />
            Add
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {candidates.map((agent) => (
              <DropdownMenuItem key={agent.id} onClick={() => onAdd(agent.id)}>
                {agent.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
