import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { orgScopedAgentsQuery } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const MENTIONS_ONLY = 'mentions';

export function TelegramAgentsPicker({
  orgId,
  agentIds,
  autoReplyAgentId,
  allowAutoReply = true,
  onAgentIdsChange,
  onAutoReplyChange,
}: {
  orgId: string;
  agentIds: string[];
  autoReplyAgentId: string | null;
  allowAutoReply?: boolean;
  onAgentIdsChange: (ids: string[]) => void;
  onAutoReplyChange: (id: string | null) => void;
}) {
  const agents = useQuery(orgScopedAgentsQuery(orgId));
  const items = agents.data?.items ?? [];
  const selected = new Set(agentIds);

  function toggle(agentId: string): void {
    const next = selected.has(agentId)
      ? agentIds.filter((id) => id !== agentId)
      : [...agentIds, agentId];
    onAgentIdsChange(next);
    if (autoReplyAgentId && !next.includes(autoReplyAgentId)) {
      onAutoReplyChange(null);
    }
  }

  if (agents.isPending) {
    return <p className="text-muted-foreground text-xs">Loading agents…</p>;
  }
  return (
    <div className="flex flex-col gap-2" data-testid="telegram-agents-picker">
      <div className="flex flex-wrap gap-1.5">
        {items.map((agent) => (
          <Button
            key={agent.id}
            type="button"
            size="sm"
            variant={selected.has(agent.id) ? 'secondary' : 'outline'}
            onClick={() => toggle(agent.id)}
          >
            {selected.has(agent.id) ? <CheckIcon className="size-3.5" aria-hidden /> : null}
            {agent.name}
          </Button>
        ))}
        {items.length === 0 ? (
          <p className="text-muted-foreground text-xs">This organization has no agents yet.</p>
        ) : null}
      </div>
      {!allowAutoReply ? (
        <p className="text-[11px] text-muted-foreground">
          Channels are mention-only: a channel post cannot trigger an automatic reply.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Who answers every message
          </span>
          <Select
            value={autoReplyAgentId ?? MENTIONS_ONLY}
            onValueChange={(value) =>
              onAutoReplyChange(value === MENTIONS_ONLY ? null : (value ?? null))
            }
          >
            <SelectTrigger size="sm" className="min-w-40" aria-label="Auto-reply agent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MENTIONS_ONLY}>Mention-only</SelectItem>
              {agentIds.map((agentId) => (
                <SelectItem key={agentId} value={agentId}>
                  {items.find((agent) => agent.id === agentId)?.name ?? agentId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
