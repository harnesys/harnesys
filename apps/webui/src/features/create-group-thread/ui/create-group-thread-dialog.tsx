import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAgentStore } from '@/entities/agent';
import { openGroupThread } from '@/features/switch-thread';
import { getActiveOrgId } from '@/shared/api/active-org';
import { membersQuery } from '@/shared/api/members';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { toast } from '@/shared/ui/toast';

export function CreateGroupThreadDialog({ onResolve }: DialogComponentProps<string | null>) {
  const orgId = getActiveOrgId();
  const agents = useAgentStore((state) => state.items);
  const users = useQuery({ ...membersQuery(orgId ?? ''), enabled: Boolean(orgId) });
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [participantUserIds, setParticipantUserIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const orgAgents = agents.filter((agent) => agent.orgId === orgId);
  const canCreate = agentIds.length > 0 && !pending;

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  async function create(): Promise<void> {
    setPending(true);
    try {
      const threadId = await openGroupThread({ agentIds, participantUserIds });
      onResolve?.(threadId);
    } catch (error) {
      setPending(false);
      toast.add({
        title: 'Could not create group',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New group thread</DialogTitle>
        <DialogDescription>
          Pick the agents that answer and the people who can join the conversation.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="font-medium text-muted-foreground text-xs">Agents</div>
          <div className="max-h-40 space-y-1 overflow-auto">
            {orgAgents.map((agent) => (
              <label key={agent.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={agentIds.includes(agent.id)}
                  onChange={() => setAgentIds((current) => toggle(current, agent.id))}
                />
                {agent.name}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <div className="font-medium text-muted-foreground text-xs">Users</div>
          <div className="max-h-40 space-y-1 overflow-auto">
            {(users.data ?? []).map((user) => (
              <label key={user.userId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={participantUserIds.includes(user.userId)}
                  onChange={() => setParticipantUserIds((current) => toggle(current, user.userId))}
                />
                {user.name || user.login}
              </label>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
        <Button type="button" disabled={!canCreate} onClick={() => void create()}>
          Create group
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function openCreateGroupThreadDialog(): Promise<string | null> {
  return dialog.open<string | null, Record<string, never>>(CreateGroupThreadDialog, { data: {} });
}
