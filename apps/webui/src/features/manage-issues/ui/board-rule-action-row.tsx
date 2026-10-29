import type { BoardStatus, ExecutionProfileListItem, RuleAction } from '@harnesys/contracts';
import { TrashIcon } from 'lucide-react';
import { type Agent, AgentRecordAvatar } from '@/entities/agent';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { sortedStatuses } from '../model/board-columns';

const INHERIT_PROFILE = '__inherit__';

export function ActionRow({
  action,
  statuses,
  agents,
  profiles,
  defaultProfileId,
  onPatch,
  onRemove,
}: {
  action: RuleAction;
  statuses: BoardStatus[];
  agents: Agent[];
  profiles: ExecutionProfileListItem[];
  defaultProfileId: string;
  onPatch: (action: RuleAction) => void;
  onRemove: () => void;
}) {
  const statusItems = sortedStatuses(statuses);
  const assignableAgents = agents.filter((agent) => !agent.parentId);
  const agent =
    action.type === 'assign_agent'
      ? assignableAgents.find((item) => item.id === action.agentId)
      : undefined;
  const inheritedProfileId = agent?.executionProfileId ?? defaultProfileId;
  return (
    <div className="flex items-center gap-1.5">
      <Select
        items={[
          { value: 'assign_agent', label: 'Assign agent' },
          { value: 'set_status', label: 'Set status' },
          { value: 'notify_owner', label: 'Notify owner' },
        ]}
        value={action.type}
        onValueChange={(value) => {
          const type = String(value);
          if (type === 'assign_agent' && assignableAgents[0]) {
            onPatch({ type: 'assign_agent', agentId: assignableAgents[0].id });
          } else if (type === 'set_status' && statusItems[0]) {
            onPatch({ type: 'set_status', statusKey: statusItems[0].key });
          } else if (type === 'notify_owner') {
            onPatch({ type: 'notify_owner', text: 'Rule fired' });
          }
        }}
      >
        <SelectTrigger size="sm" className="w-32 shrink-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="assign_agent">Assign agent</SelectItem>
          <SelectItem value="set_status">Set status</SelectItem>
          <SelectItem value="notify_owner">Notify owner</SelectItem>
        </SelectContent>
      </Select>
      {action.type === 'assign_agent' ? (
        <>
          <Select
            items={assignableAgents.map((item) => ({ value: item.id, label: item.name }))}
            value={action.agentId}
            onValueChange={(value) =>
              value && onPatch({ type: 'assign_agent', agentId: String(value) })
            }
          >
            <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs">
              <SelectValue placeholder="Agent">
                {(value: unknown) => {
                  const selected = assignableAgents.find((item) => item.id === value);
                  if (!selected) {
                    return 'Agent';
                  }
                  return (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <AgentRecordAvatar agent={selected} />
                      <span className="truncate">{selected.name}</span>
                    </span>
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {assignableAgents.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="flex items-center gap-1.5">
                    <AgentRecordAvatar agent={item} />
                    {item.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={[
              { value: INHERIT_PROFILE, label: 'Inherit · agent / org' },
              ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
            ]}
            value={action.executionProfileId ?? INHERIT_PROFILE}
            onValueChange={(value) =>
              onPatch({
                type: 'assign_agent',
                agentId: action.agentId,
                executionProfileId: !value || value === INHERIT_PROFILE ? undefined : String(value),
              })
            }
          >
            <SelectTrigger size="sm" className="w-40 shrink-0 text-xs">
              <SelectValue placeholder="Execution profile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT_PROFILE}>Inherit · agent / org</SelectItem>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                  {profile.id === inheritedProfileId ? ' (inherited)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
      {action.type === 'set_status' ? (
        <Select
          items={statusItems.map((item) => ({ value: item.key, label: item.label }))}
          value={action.statusKey}
          onValueChange={(value) =>
            value && onPatch({ type: 'set_status', statusKey: String(value) })
          }
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {action.type === 'notify_owner' ? (
        <Input
          value={action.text}
          onChange={(event) => onPatch({ type: 'notify_owner', text: event.target.value })}
          onBlur={(event) => {
            if (!event.target.value.trim()) {
              onPatch({ type: 'notify_owner', text: 'Rule fired' });
            }
          }}
          className="h-7 min-w-0 flex-1 text-xs"
          placeholder="Notification text"
        />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove action"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <TrashIcon className="size-3" />
      </Button>
    </div>
  );
}
