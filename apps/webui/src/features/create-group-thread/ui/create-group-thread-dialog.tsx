import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { AgentRecordAvatar, useAgentStore } from '@/entities/agent';
import { openGroupThread } from '@/features/switch-thread';
import { getActiveOrgId } from '@/shared/api/active-org';
import { membersQuery } from '@/shared/api/members';
import { cn } from '@/shared/lib/utils';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { ThreadColorPicker, ThreadIconPicker } from '@/shared/ui/thread-appearance-picker';
import { toast } from '@/shared/ui/toast';
import { UserAvatar } from '@/shared/ui/user-avatar';

export function CreateGroupThreadDialog({ onResolve }: DialogComponentProps<string | null>) {
  const orgId = getActiveOrgId();
  const agents = useAgentStore((state) => state.items);
  const users = useQuery({ ...membersQuery(orgId ?? ''), enabled: Boolean(orgId) });
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [participantUserIds, setParticipantUserIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const orgAgents = agents.filter((agent) => agent.orgId === orgId);
  const canCreate = title.trim().length > 0 && agentIds.length > 0 && !pending;

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  async function create(): Promise<void> {
    setPending(true);
    try {
      const threadId = await openGroupThread({
        agentIds,
        participantUserIds,
        title: title.trim(),
        ...(icon ? { icon } : {}),
        ...(color ? { color } : {}),
      });
      onResolve?.(threadId);
    } catch (error) {
      setPending(false);
      toast.add({
        title: 'Could not create channel',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  return (
    <DialogContent layoutKey="create-group-thread">
      <DialogHeader>
        <DialogTitle>New channel</DialogTitle>
        <DialogDescription>
          Pick the agents that answer and the people who can join the conversation.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="channel-name" className="font-medium text-muted-foreground text-xs">
            Name
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="channel-name"
              type="text"
              className="flex-1"
              value={title}
              maxLength={120}
              placeholder="Channel name"
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />
            <ThreadIconPicker value={icon} onChange={setIcon} testIdPrefix="channel-icon" />
          </div>
          <ThreadColorPicker value={color} onChange={setColor} testIdPrefix="channel-color" />
        </div>
        <div className="space-y-1">
          <div className="font-medium text-muted-foreground text-xs">Agents</div>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
            {orgAgents.map((agent) => (
              <PickerChip
                key={agent.id}
                label={agent.name}
                selected={agentIds.includes(agent.id)}
                onToggle={() => setAgentIds((current) => toggle(current, agent.id))}
                avatar={<AgentRecordAvatar agent={agent} size="xs" title={agent.name} />}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <div className="font-medium text-muted-foreground text-xs">Users</div>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
            {(users.data ?? []).map((user) => (
              <PickerChip
                key={user.userId}
                label={user.name || user.login}
                selected={participantUserIds.includes(user.userId)}
                onToggle={() => setParticipantUserIds((current) => toggle(current, user.userId))}
                avatar={
                  <UserAvatar
                    name={user.name || user.login}
                    seed={user.userId}
                    size="xs"
                    title={user.name || user.login}
                  />
                }
              />
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
        <Button type="button" disabled={!canCreate} onClick={() => void create()}>
          Create channel
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PickerChip({
  label,
  avatar,
  selected,
  onToggle,
}: {
  label: string;
  avatar: ReactNode;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={`channel-participant-${label}`}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-sm transition-colors',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {avatar}
      <span className="max-w-36 truncate">{label}</span>
    </button>
  );
}

export function openCreateGroupThreadDialog(): Promise<string | null> {
  return dialog.open<string | null, Record<string, never>>(CreateGroupThreadDialog, { data: {} });
}
